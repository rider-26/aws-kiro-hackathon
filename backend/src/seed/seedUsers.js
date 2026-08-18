const authService = require('../services/authService');

const DEMO_PASSWORD = 'demo1234';

/**
 * Seeds the 3 required demo accounts (section 4 of the spec) plus a handful
 * of additional tutees/tutors so list views aren't empty. Additional tutor
 * profile detail (bio, topics, availability, verification) is seeded
 * separately in seedTutors.js (Task 3), which looks these users up by email.
 *
 * All seeded users share the password "demo1234" for ease of demoing.
 */
const SEED_USERS = [
  { full_name: 'Jinyu Chen', email: 'jinyu@student.demo', role: 'Tutee', course: 'IT', year_of_study: '2' },
  { full_name: 'Alex Tan', email: 'alex@tutor.demo', role: 'Tutor', course: 'Cybersecurity', year_of_study: '3' },
  { full_name: 'Ms Lim', email: 'lecturer@admin.demo', role: 'Admin', course: '', year_of_study: '' },

  // Additional tutees so tutor-side lists (bookings, reviews, reports) aren't just Jinyu.
  { full_name: 'Farhan Rahman', email: 'farhan@student.demo', role: 'Tutee', course: 'IT', year_of_study: '1' },
  { full_name: 'Mei Ling Ong', email: 'meiling@student.demo', role: 'Tutee', course: 'Business IT', year_of_study: '2' },

  // Additional tutors for Find Tutors filtering (Task 3/4).
  { full_name: 'Priya Nair', email: 'priya@tutor.demo', role: 'Tutor', course: 'Computer Engineering', year_of_study: '3' },
  { full_name: 'Marcus Wong', email: 'marcus@tutor.demo', role: 'Tutor', course: 'Cybersecurity', year_of_study: '2' },
  { full_name: 'Siti Aisyah', email: 'siti@tutor.demo', role: 'Tutor', course: 'IT', year_of_study: '3' },
  { full_name: 'Daniel Koh', email: 'daniel@tutor.demo', role: 'Tutor', course: 'Networking & Cybersecurity', year_of_study: '3' },
];

async function seedUsers() {
  const created = {};
  for (const u of SEED_USERS) {
    const user = await authService.createSeedUser({ ...u, password: DEMO_PASSWORD });
    created[u.email] = user;
    // eslint-disable-next-line no-console
    console.log(`  user: ${u.email} (${u.role}) -> ${user.id}`);
  }
  return created;
}

module.exports = { seedUsers, SEED_USERS, DEMO_PASSWORD };
