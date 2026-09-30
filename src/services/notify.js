// In-app notifications. Every notification is triggered by a real event (status change,
// enquiry reply, new match …) and stored in the "notifications" collection.
const db = require('../db');
const { newId, now } = require('../utils');

const TYPES = ['application', 'status', 'info', 'appointment', 'approved', 'declined', 'adopted', 'enquiry',
  'pet', 'match', 'account', 'staff'];

async function notify(userId, { title, message, link = 'dashboard.html', type = 'status' }) {
  if (!userId) return null;
  const note = { id: newId('note'), userId, type: TYPES.includes(type) ? type : 'status', title, message, link, read: false, at: now() };
  await db.insert('notifications', note);
  return note;
}

// Notify every active staff member of a shelter (admins too, so nothing is missed)
async function notifyStaff(shelterId, payload) {
  const staff = (await db.find('users')).filter((u) => u.active !== false
    && (u.role === 'admin' || (u.role === 'staff' && (!shelterId || u.shelterId === shelterId))));
  await Promise.all(staff.map((u) => notify(u.id, { type: 'staff', ...payload })));
  return staff;
}

module.exports = { notify, notifyStaff };
