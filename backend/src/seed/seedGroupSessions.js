/* eslint-disable no-console */
const idGen = require('../utils/idGen');
const sessionRepository = require('../repositories/sessionRepository');
const sessionParticipantRepository = require('../repositories/sessionParticipantRepository');

/**
 * Seeds a couple of open group sessions so the Group Sessions page has content
 * on a fresh database, including one that is partially filled to demonstrate
 * the "N / M" occupancy display from spec section 13.
 */

function futureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function seedGroupSessions(users, modules, tutors) {
  if (!tutors?.alex || !modules.IT2513) {
    console.log('  skipped: Alex or IT2513 not found');
    return [];
  }

  // Idempotency: don't add more group sessions on a re-seed.
  const existing = await sessionRepository.listByTutor(tutors.alex.id);
  if (existing.some((s) => !s.booking_id && (s.maximum_students || 0) > 1)) {
    console.log('  skipped: group sessions already present');
    return [];
  }

  const created = [];

  const alexSession = await sessionRepository.create({
    id: idGen('session'),
    booking_id: null,
    tutor_id: tutors.alex.id,
    module_id: modules.IT2513.id,
    title: 'IT2513 Crypto Revision — Signatures & Certificates',
    topics: ['Digital Signatures', 'Certificates'],
    date: futureDate(5),
    start_time: '15:00',
    end_time: '16:30',
    session_mode: 'Online',
    location: 'Online (in-app)',
    maximum_students: 5,
    status: 'Upcoming',
    start_timestamp: null,
    end_timestamp: null,
    attendance_verified: false,
    created_date: new Date().toISOString(),
  });
  created.push(alexSession);
  console.log(`  group session: ${alexSession.title}`);

  // Two students already joined, so the page shows "2 / 5".
  for (const email of ['farhan@student.demo', 'meiling@student.demo']) {
    const student = users[email];
    if (!student) continue;
    await sessionParticipantRepository.create({
      id: idGen('participant'),
      session_id: alexSession.id,
      student_id: student.id,
      attendance_status: 'Registered',
      check_in_time: null,
      check_out_time: null,
      completion_confirmed: false,
      joined_date: new Date().toISOString(),
    });
  }

  if (tutors.marcus && modules.IT2513) {
    const marcusSession = await sessionRepository.create({
      id: idGen('session'),
      booking_id: null,
      tutor_id: tutors.marcus.id,
      module_id: modules.IT2513.id,
      title: 'IT2513 Hashing & HMAC Walkthrough',
      topics: ['Hashing', 'HMAC'],
      date: futureDate(8),
      start_time: '18:00',
      end_time: '19:30',
      session_mode: 'Online',
      location: 'Online (in-app)',
      maximum_students: 6,
      status: 'Upcoming',
      start_timestamp: null,
      end_timestamp: null,
      attendance_verified: false,
      created_date: new Date().toISOString(),
    });
    created.push(marcusSession);
    console.log(`  group session: ${marcusSession.title}`);
  }

  if (tutors.priya && modules.IT1913) {
    const priyaSession = await sessionRepository.create({
      id: idGen('session'),
      booking_id: null,
      tutor_id: tutors.priya.id,
      module_id: modules.IT1913.id,
      title: 'IT1913 SQL Joins Clinic',
      topics: ['SQL Joins', 'Normalization'],
      date: futureDate(6),
      start_time: '14:00',
      end_time: '15:30',
      session_mode: 'Physical',
      location: 'Library discussion room (to be confirmed)',
      maximum_students: 3,
      status: 'Upcoming',
      start_timestamp: null,
      end_timestamp: null,
      attendance_verified: false,
      created_date: new Date().toISOString(),
    });
    created.push(priyaSession);
    console.log(`  group session: ${priyaSession.title}`);
  }

  return created;
}

module.exports = { seedGroupSessions };
