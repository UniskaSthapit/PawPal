// In-app notifications. Every notification is triggered by a real event (status change,
// enquiry reply, new match …) and stored in the "notifications" collection.
// Each notification is also emailed (branded layout) unless the caller already sends a more specific
// email for the same event ({ email: false }) or the recipient turned that kind of email off.
const db = require('../db');
const { newId, now } = require('../utils');

const TYPES = ['application', 'status', 'info', 'appointment', 'approved', 'declined', 'adopted', 'enquiry',
  'pet', 'match', 'account', 'staff', 'booking', 'careplan', 'payment'];
// Notifications about the adopter's own applications follow their "Email me about my applications" setting;
// staff notifications follow the staff "Email me about shelter activity" setting. Everything else is always emailed.
const APPLICATION_TYPES = ['application', 'status', 'info', 'appointment', 'approved', 'declined', 'adopted', 'booking', 'careplan'];

// Defaults for the per-user email settings (both on)
const emailPrefs = (user) => ({ applications: user?.emailPrefs?.applications !== false, activity: user?.emailPrefs?.activity !== false });

// Why an email for this notification type should not go to this user ('' = send it)
function emailOptOutReason(user, type) {
  const prefs = emailPrefs(user);
  if (APPLICATION_TYPES.includes(type) && !prefs.applications) return 'Not sent: the adopter turned off emails about their applications.';
  if (type === 'staff' && !prefs.activity) return 'Not sent: this team member turned off shelter activity emails.';
  return '';
}

async function emailNotification(userId, note) {
  const user = await db.findOne('users', { id: userId });
  if (!user || user.active === false || !user.email) return null;
  const { emails } = require('./mailer'); // required lazily: mailer is loaded after the database
  return emails.notification(user, note, { skipReason: emailOptOutReason(user, note.type) });
}

async function notify(userId, { title, message, link = 'dashboard.html', type = 'status' }, { email = true } = {}) {
  if (!userId) return null;
  const note = { id: newId('note'), userId, type: TYPES.includes(type) ? type : 'status', title, message, link, read: false, at: now() };
  await db.insert('notifications', note);
  // Sent in the background so a slow email provider never delays the page; failures are logged by the mailer
  if (email) emailNotification(userId, note).catch((err) => console.error('✉️  Notification email failed:', err.message));
  return note;
}

// Notify every active staff member of a shelter (admins too, so nothing is missed)
async function notifyStaff(shelterId, payload) {
  const staff = (await db.find('users')).filter((u) => u.active !== false
    && (u.role === 'admin' || (u.role === 'staff' && (!shelterId || u.shelterId === shelterId))));
  await Promise.all(staff.map((u) => notify(u.id, { type: 'staff', ...payload })));
  return staff;
}

module.exports = { notify, notifyStaff, emailPrefs, emailOptOutReason, APPLICATION_TYPES };
