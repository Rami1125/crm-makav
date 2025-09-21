// Import and configure the Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getMessaging, onBackgroundMessage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-sw.js";

const firebaseConfig = {
    apiKey: "AIzaSyDQJVnK0yvkwB2NVgnlEstQ8Z052eHHs0Y",
    authDomain: "hsaban-644c5.firebaseapp.com",
    projectId: "hsaban-644c5",
    storageBucket: "hsaban-644c5.appspot.com",
    messagingSenderId: "529146260844",
    appId: "1:529146260844:web:48c73fdfcbc9b18f1a9749",
    measurementId: "G-9N63E8QPN0"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
