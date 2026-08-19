const idGen = require('../utils/idGen');
const tutorProfileRepository = require('../repositories/tutorProfileRepository');
const tutorTopicRepository = require('../repositories/tutorTopicRepository');
const tutorAvailabilityRepository = require('../repositories/tutorAvailabilityRepository');
const tutorVerificationRepository = require('../repositories/tutorVerificationRepository');

/**
 * Seeds full tutor detail (TutorProfile, TutorTopic, TutorAvailability,
 * TutorVerification) for the 5 tutor users created in seedUsers.js, keyed
 * by email so this can run after seedUsers regardless of generated ids.
 *
 * Alex Tan matches the exact spec numbers (section 6). The other 4 tutors
 * have deliberately varied ratings/topics/availability/session modes/group
 * sizes so Find Tutors filtering (Task 4) has something real to filter.
 * One tutor (Daniel Koh) is left with a Pending verification only, so the
 * admin verification demo workflow (section 2) has something to approve.
 */
async function seedTutors(users, modules) {
  const alexUser = users['alex@tutor.demo'];
  const priyaUser = users['priya@tutor.demo'];
  const marcusUser = users['marcus@tutor.demo'];
  const sitiUser = users['siti@tutor.demo'];
  const danielUser = users['daniel@tutor.demo'];

  const IT2513 = modules.IT2513;
  const IT2511 = modules.IT2511;
  const IT1913 = modules.IT1913;
  const IT2143 = modules.IT2143;
  const IT2723 = modules.IT2723;

  async function ensureProfile(userId, data) {
    let profile = await tutorProfileRepository.getByUserId(userId);
    if (!profile) {
      profile = await tutorProfileRepository.create({
        id: idGen('tutorprofile'),
        user_id: userId,
        created_date: new Date().toISOString(),
        ...data,
      });
    }
    return profile;
  }

  async function ensureTopics(tutorId, moduleId, topicNames) {
    const existing = await tutorTopicRepository.listByTutor(tutorId);
    const existingNames = new Set(existing.filter((t) => t.module_id === moduleId).map((t) => t.topic_name));
    for (const name of topicNames) {
      if (!existingNames.has(name)) {
        await tutorTopicRepository.create({ id: idGen('topic'), tutor_id: tutorId, module_id: moduleId, topic_name: name });
      }
    }
  }

  async function ensureAvailability(tutorId, slots) {
    const existing = await tutorAvailabilityRepository.listByTutor(tutorId);
    if (existing.length > 0) return; // idempotency: don't duplicate on re-seed
    for (const slot of slots) {
      await tutorAvailabilityRepository.create({
        id: idGen('availability'),
        tutor_id: tutorId,
        active: true,
        repeating: true,
        ...slot,
      });
    }
  }

  async function ensureVerification(tutorId, moduleId, status) {
    const existing = await tutorVerificationRepository.listByTutor(tutorId);
    const already = existing.find((v) => v.module_id === moduleId);
    if (already) return already;
    return tutorVerificationRepository.create({
      id: idGen('verification'),
      tutor_id: tutorId,
      module_id: moduleId,
      status,
      verified_by: status === 'Verified' ? 'seed-admin' : null,
      verified_date: status === 'Verified' ? new Date().toISOString() : null,
      admin_notes: status === 'Verified' ? 'Seeded as verified for demo purposes.' : '',
      created_date: new Date().toISOString(),
    });
  }

  // --- Alex Tan (main tutor, exact spec numbers) ---
  const alex = await ensureProfile(alexUser.id, {
    bio: 'I enjoy breaking difficult cybersecurity concepts into simple steps.',
    teaching_style: 'Diagrams, practical examples and step-by-step explanations.',
    portfolio_url: 'https://placeholder.peerlink.nyp/portfolio/alex-tan',
    linkedin_url: 'https://placeholder.peerlink.nyp/linkedin/alex-tan',
    maximum_group_size: 5,
    maximum_weekly_sessions: 12,
    physical_enabled: true,
    online_enabled: true,
    average_rating: 4.8,
    completed_sessions: 24,
    students_helped: 41,
    total_tutoring_minutes: 24 * 60,
  });
  await ensureTopics(alex.id, IT2513.id, ['Digital Signatures', 'RSA', 'Hashing', 'Certificates']);
  await ensureAvailability(alex.id, [
    { day_or_date: 'Monday', start_time: '15:00', end_time: '17:00', session_mode: 'Both' },
    { day_or_date: 'Wednesday', start_time: '13:00', end_time: '16:00', session_mode: 'Both' },
    { day_or_date: 'Friday', start_time: '10:00', end_time: '12:00', session_mode: 'Both' },
  ]);
  await ensureVerification(alex.id, IT2513.id, 'Verified');
  await ensureVerification(alex.id, IT2511.id, 'Verified');

  // --- Priya Nair (Computer Engineering, high rating, different module) ---
  const priya = await ensureProfile(priyaUser.id, {
    bio: 'I love visualising how databases actually store and retrieve data — it makes SQL click.',
    teaching_style: 'Whiteboard ER diagrams followed by hands-on query practice.',
    portfolio_url: 'https://placeholder.peerlink.nyp/portfolio/priya-nair',
    linkedin_url: 'https://placeholder.peerlink.nyp/linkedin/priya-nair',
    maximum_group_size: 3,
    maximum_weekly_sessions: 8,
    physical_enabled: true,
    online_enabled: false,
    average_rating: 4.9,
    completed_sessions: 31,
    students_helped: 28,
    total_tutoring_minutes: 31 * 50,
  });
  await ensureTopics(priya.id, IT1913.id, ['Normalization', 'SQL Joins', 'Transactions', 'ER Modelling']);
  await ensureAvailability(priya.id, [
    { day_or_date: 'Tuesday', start_time: '14:00', end_time: '16:00', session_mode: 'Physical' },
    { day_or_date: 'Thursday', start_time: '09:00', end_time: '11:00', session_mode: 'Physical' },
  ]);
  await ensureVerification(priya.id, IT1913.id, 'Verified');

  // --- Marcus Wong (Cybersecurity, overlaps IT2513 with Alex but different topics/lower rating) ---
  const marcus = await ensureProfile(marcusUser.id, {
    bio: 'Former CTF player — I like teaching security through attacker-mindset examples.',
    teaching_style: 'Scenario-based walkthroughs and live demos.',
    portfolio_url: 'https://placeholder.peerlink.nyp/portfolio/marcus-wong',
    linkedin_url: 'https://placeholder.peerlink.nyp/linkedin/marcus-wong',
    maximum_group_size: 6,
    maximum_weekly_sessions: 15,
    physical_enabled: false,
    online_enabled: true,
    average_rating: 4.3,
    completed_sessions: 12,
    students_helped: 19,
    total_tutoring_minutes: 12 * 45,
  });
  await ensureTopics(marcus.id, IT2513.id, ['Hashing', 'HMAC', 'RSA']);
  await ensureAvailability(marcus.id, [
    { day_or_date: 'Wednesday', start_time: '18:00', end_time: '20:00', session_mode: 'Online' },
    { day_or_date: 'Saturday', start_time: '10:00', end_time: '13:00', session_mode: 'Online' },
  ]);
  await ensureVerification(marcus.id, IT2513.id, 'Verified');

  // --- Siti Aisyah (Software Engineering, mid rating) ---
  const siti = await ensureProfile(sitiUser.id, {
    bio: 'I help students structure messy assignment requirements into a clear design.',
    teaching_style: 'Mind-mapping requirements, then pattern-matching to known design patterns.',
    portfolio_url: 'https://placeholder.peerlink.nyp/portfolio/siti-aisyah',
    linkedin_url: 'https://placeholder.peerlink.nyp/linkedin/siti-aisyah',
    maximum_group_size: 4,
    maximum_weekly_sessions: 10,
    physical_enabled: true,
    online_enabled: true,
    average_rating: 4.5,
    completed_sessions: 18,
    students_helped: 22,
    total_tutoring_minutes: 18 * 55,
  });
  await ensureTopics(siti.id, IT2143.id, ['Design Patterns', 'Requirements Analysis', 'UML']);
  await ensureAvailability(siti.id, [
    { day_or_date: 'Monday', start_time: '11:00', end_time: '13:00', session_mode: 'Both' },
    { day_or_date: 'Thursday', start_time: '15:00', end_time: '17:00', session_mode: 'Both' },
  ]);
  await ensureVerification(siti.id, IT2143.id, 'Verified');

  // --- Daniel Koh (Cloud/Cybersecurity crossover, pending verification for admin demo) ---
  const daniel = await ensureProfile(danielUser.id, {
    bio: 'I focus on how cloud platforms implement the crypto concepts you learn in class.',
    teaching_style: 'Cloud console walkthroughs mapped back to textbook theory.',
    portfolio_url: 'https://placeholder.peerlink.nyp/portfolio/daniel-koh',
    linkedin_url: 'https://placeholder.peerlink.nyp/linkedin/daniel-koh',
    maximum_group_size: 4,
    maximum_weekly_sessions: 8,
    physical_enabled: false,
    online_enabled: true,
    average_rating: 0,
    completed_sessions: 0,
    students_helped: 0,
    total_tutoring_minutes: 0,
  });
  await ensureTopics(daniel.id, IT2723.id, ['Key Management', 'Cloud IAM']);
  await ensureTopics(daniel.id, IT2513.id, ['Certificates']);
  await ensureAvailability(daniel.id, [
    { day_or_date: 'Friday', start_time: '14:00', end_time: '16:00', session_mode: 'Online' },
  ]);
  // Deliberately Pending, not Verified — this is the "pending tutor application"
  // the admin demo workflow (section 2) reviews and approves/rejects.
  await ensureVerification(daniel.id, IT2723.id, 'Pending');
  await ensureVerification(daniel.id, IT2513.id, 'Pending');

  return { alex, priya, marcus, siti, daniel };
}

module.exports = { seedTutors };
