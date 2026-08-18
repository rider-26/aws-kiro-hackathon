const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quiz.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

// Quizzes are private student learning data (business rule 9): Tutee-only,
// and every handler verifies the quiz/attempt belongs to the caller.
router.use(requireAuth, requireRole('Tutee'));

router.get('/', quizController.listQuizzes);
router.post('/generate', quizController.generateQuiz);

router.get('/attempts/:attemptId', quizController.getAttempt);
router.get('/attempts/:attemptId/diagnosis', quizController.getDiagnosis);

router.get('/:id', quizController.getQuiz);
router.post('/:id/attempts', quizController.startAttempt);
router.post('/:id/grade', quizController.gradeAnswer);
router.post('/:id/submit', quizController.submitAttempt);

module.exports = router;
