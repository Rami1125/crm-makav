const {onCall} = require("firebase-functions/v2/https");
const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {defineString} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const {GoogleSpreadsheet} = require("google-spreadsheet");
const {JWT} = require("google-auth-library");

admin.initializeApp();

// Define secrets that will be prompted for during deployment
const sheetsClientEmail = defineString("firebase-adminsdk-fbsvc@hsaban-644c5.iam.gserviceaccount.com");
const sheetsPrivateKey = defineString("ad047573d15e776ab9c551d0ae94ff47bc850288");

// Function to initialize Google Sheets Auth
const getAuth = () => {
  return new JWT({
    email: sheetsClientEmail.value(),
    key: sheetsPrivateKey.value().replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
};

const SPREADSHEET_ID = "1lEAKmQwf71eMRQ1Z_yHF7-9Bf66LAjOa2DuC0cKcKJA";
const PRODUCT_CATALOG_SHEET_TITLE = "קטלוג מוצרים";

exports.getProductCatalog = onCall({
    region: "us-central1",
    memory: "512MiB",
    cpu: 1,
}, async (request) => {
  try {
    const serviceAccountAuth = getAuth();
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[PRODUCT_CATALOG_SHEET_TITLE];
    if (!sheet) {
      throw new Error(`Sheet "${PRODUCT_CATALOG_SHEET_TITLE}" not found.`);
    }
    const rows = await sheet.getRows();
    const catalog = rows.map((row) => row.toObject());
    return {success: true, catalog};
  } catch (error) {
    logger.error("Error fetching product catalog:", error);
    return {success: false, error: error.message};
  }
});

exports.sendPushNotificationOnNewRequest = onDocumentCreated({
  document: "clientRequests/{requestId}",
  region: "us-central1",
}, async (event) => {
  const newRequest = event.data.data();
  const payload = {
    notification: {
      title: "🔔 בקשה חדשה התקבלה!",
      body: `מאת: ${newRequest.clientName} | סוג: ${newRequest.requestType}`,
      icon: "https://i.postimg.cc/2SbDgD1B/1.png",
    },
    webpush: {fcmOptions: {link: "/dashboard.html"}},
  };

  const tokensSnapshot = await admin.firestore().collection("dashboardTokens").get();
  if (tokensSnapshot.empty) {
    logger.log("No dashboard tokens to send notification to.");
    return;
  }

  const tokens = tokensSnapshot.docs.map((doc) => doc.id);
  const response = await admin.messaging().sendToDevice(tokens, payload);
  await cleanupInvalidTokens(response, tokens, "dashboardTokens");
});

exports.notifyClientOnStatusChange = onDocumentUpdated({
  document: "clientRequests/{requestId}",
  region: "us-central1",
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (before.status === after.status) return;

  const clientId = after.clientId;
  const clientDoc = await admin.firestore().collection("clients").doc(clientId).get();
  if (!clientDoc.exists || !clientDoc.data().fcmToken) return;

  const clientToken = clientDoc.data().fcmToken;
  let statusMessage = "";
  if (after.status === "in-progress") {
    statusMessage = "הבקשה שלך התקבלה והיא בטיפול!";
  } else if (after.status === "completed") {
    statusMessage = "הבקשה שלך הושלמה. תודה!";
  } else return;

  const payload = {
    notification: {
      title: "סטטוס בקשה התעדכן",
      body: statusMessage,
      icon: "https://i.postimg.cc/2SbDgD1B/1.png",
    },
    webpush: {fcmOptions: {link: "/"}},
  };

  const response = await admin.messaging().sendToDevice([clientToken], payload);
  await cleanupInvalidTokens(response, [clientToken], "clients", clientId);
});

async function cleanupInvalidTokens(response, tokens, collectionName, docId = null) {
  const tokensToDelete = [];
  response.results.forEach((result, index) => {
    const error = result.error;
    if (error && (error.code === "messaging/invalid-registration-token" || error.code === "messaging/registration-token-not-registered")) {
      if (collectionName === "clients" && docId) {
        tokensToDelete.push(admin.firestore().collection(collectionName).doc(docId).update({fcmToken: admin.firestore.FieldValue.delete()}));
      } else {
        tokensToDelete.push(admin.firestore().collection(collectionName).doc(tokens[index]).delete());
      }
    }
  });
  return Promise.all(tokensToDelete);
}

