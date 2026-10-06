export const firebaseConfig = {
  apiKey: 'AIzaSyCohqQ3ySjCdWKZSujhKF-7XbSiV1bJPX0',
  authDomain: 'mpsreserve.firebaseapp.com',
  projectId: 'mpsreserve',
  storageBucket: 'mpsreserve.firebasestorage.app',
  messagingSenderId: '961426297157',
  appId: '1:961426297157:web:d61df305fd504870782e2c'
};
// When hosted statically, point these at the separately hosted AI server.
export const summaryEndpoint = './api/summary';
export const healthEndpoint = './api/health';

// Login IDs map to Firebase emails; passwords are verified by Firebase Auth.
export const loginAliases = {"admin": "jungwookii@gmail.com"};
