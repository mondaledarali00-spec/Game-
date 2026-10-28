/* Offline exercise library + built-in programs.
   Everything ships inside the APK, so the app is fully usable with no network. */
(function (global) {
  'use strict';

  var EXERCISES = [
    // ---- Chest ----
    { id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', equipment: 'Barbell', level: 'Intermediate', sets: 4, reps: '6-8', cue: 'Shoulder blades pinned back, bar to mid-chest, drive feet into the floor.' },
    { id: 'db-press', name: 'Dumbbell Bench Press', muscle: 'Chest', equipment: 'Dumbbell', level: 'Beginner', sets: 4, reps: '8-12', cue: 'Elbows ~45°, lower until you feel a stretch, press without clanging the bells.' },
    { id: 'incline-db-press', name: 'Incline Dumbbell Press', muscle: 'Chest', equipment: 'Dumbbell', level: 'Intermediate', sets: 3, reps: '8-12', cue: 'Bench at 30°, keep wrists stacked over elbows.' },
    { id: 'pushup', name: 'Push-Up', muscle: 'Chest', equipment: 'Bodyweight', level: 'Beginner', sets: 3, reps: '10-20', cue: 'Body in one line, elbows track back at 45°, full lockout.' },
    { id: 'cable-fly', name: 'Cable Fly', muscle: 'Chest', equipment: 'Cable', level: 'Intermediate', sets: 3, reps: '12-15', cue: 'Slight elbow bend, hug the arms across, squeeze for a second.' },
    { id: 'dips', name: 'Chest Dip', muscle: 'Chest', equipment: 'Bodyweight', level: 'Advanced', sets: 3, reps: '8-12', cue: 'Lean forward slightly, descend until upper arms are parallel.' },

    // ---- Back ----
    { id: 'deadlift', name: 'Barbell Deadlift', muscle: 'Back', equipment: 'Barbell', level: 'Advanced', sets: 4, reps: '3-5', cue: 'Bar over mid-foot, wedge the hips down, stand tall, never round the lower back.' },
    { id: 'pullup', name: 'Pull-Up', muscle: 'Back', equipment: 'Bodyweight', level: 'Intermediate', sets: 4, reps: '5-10', cue: 'Start from a dead hang, pull the elbows to the ribs, chin over the bar.' },
    { id: 'lat-pulldown', name: 'Lat Pulldown', muscle: 'Back', equipment: 'Machine', level: 'Beginner', sets: 4, reps: '10-12', cue: 'Chest proud, pull the bar to the collarbone, control the way up.' },
    { id: 'bb-row', name: 'Barbell Row', muscle: 'Back', equipment: 'Barbell', level: 'Intermediate', sets: 4, reps: '8-10', cue: 'Hinge to 45°, row to the belly button, no jerking with the hips.' },
    { id: 'db-row', name: 'Single-Arm Dumbbell Row', muscle: 'Back', equipment: 'Dumbbell', level: 'Beginner', sets: 3, reps: '10-12', cue: 'Flat back, pull the elbow past the ribcage, pause at the top.' },
    { id: 'face-pull', name: 'Face Pull', muscle: 'Back', equipment: 'Cable', level: 'Beginner', sets: 3, reps: '15-20', cue: 'Rope at eye level, pull apart toward the forehead, squeeze the rear delts.' },
    { id: 'seated-row', name: 'Seated Cable Row', muscle: 'Back', equipment: 'Cable', level: 'Beginner', sets: 3, reps: '10-12', cue: 'Tall torso, no leaning back, elbows close to the body.' },
    { id: 'inverted-row', name: 'Inverted Row', muscle: 'Back', equipment: 'Bodyweight', level: 'Beginner', sets: 3, reps: '10-15', cue: 'Straight line from heel to head, chest to the bar.' },

    // ---- Legs ----
    { id: 'squat', name: 'Barbell Back Squat', muscle: 'Legs', equipment: 'Barbell', level: 'Intermediate', sets: 4, reps: '5-8', cue: 'Knees track over toes, brace the core, break parallel with control.' },
    { id: 'goblet-squat', name: 'Goblet Squat', muscle: 'Legs', equipment: 'Dumbbell', level: 'Beginner', sets: 3, reps: '12-15', cue: 'Hold the weight at the chest, sit straight down between the hips.' },
    { id: 'rdl', name: 'Romanian Deadlift', muscle: 'Legs', equipment: 'Barbell', level: 'Intermediate', sets: 3, reps: '8-10', cue: 'Push the hips back, bar stays on the thighs, stop at hamstring stretch.' },
    { id: 'leg-press', name: 'Leg Press', muscle: 'Legs', equipment: 'Machine', level: 'Beginner', sets: 4, reps: '10-15', cue: 'Feet shoulder width, do not let the lower back round off the pad.' },
    { id: 'lunge', name: 'Walking Lunge', muscle: 'Legs', equipment: 'Dumbbell', level: 'Beginner', sets: 3, reps: '10 each', cue: 'Long step, back knee kisses the floor, drive through the front heel.' },
    { id: 'leg-curl', name: 'Lying Leg Curl', muscle: 'Legs', equipment: 'Machine', level: 'Beginner', sets: 3, reps: '12-15', cue: 'Hips glued down, curl fully, lower for 3 seconds.' },
    { id: 'calf-raise', name: 'Standing Calf Raise', muscle: 'Legs', equipment: 'Machine', level: 'Beginner', sets: 4, reps: '15-20', cue: 'Full stretch at the bottom, pause 1s at the top.' },
    { id: 'hip-thrust', name: 'Hip Thrust', muscle: 'Legs', equipment: 'Barbell', level: 'Intermediate', sets: 3, reps: '10-12', cue: 'Chin tucked, ribs down, squeeze glutes hard at the top.' },

    // ---- Shoulders ----
    { id: 'ohp', name: 'Overhead Press', muscle: 'Shoulders', equipment: 'Barbell', level: 'Intermediate', sets: 4, reps: '6-8', cue: 'Brace hard, bar path close to the face, head through at the top.' },
    { id: 'db-lateral', name: 'Dumbbell Lateral Raise', muscle: 'Shoulders', equipment: 'Dumbbell', level: 'Beginner', sets: 3, reps: '12-15', cue: 'Lead with the elbows, stop at shoulder height, no swinging.' },
    { id: 'db-shoulder-press', name: 'Seated Dumbbell Press', muscle: 'Shoulders', equipment: 'Dumbbell', level: 'Beginner', sets: 3, reps: '8-12', cue: 'Ribs down, press slightly forward of the ears.' },
    { id: 'rear-delt-fly', name: 'Rear Delt Fly', muscle: 'Shoulders', equipment: 'Dumbbell', level: 'Beginner', sets: 3, reps: '15-20', cue: 'Hinge forward, arms out wide, thumbs down.' },
    { id: 'pike-pushup', name: 'Pike Push-Up', muscle: 'Shoulders', equipment: 'Bodyweight', level: 'Intermediate', sets: 3, reps: '8-12', cue: 'Hips high, crown of the head to the floor, press back up.' },

    // ---- Arms ----
    { id: 'bb-curl', name: 'Barbell Curl', muscle: 'Arms', equipment: 'Barbell', level: 'Beginner', sets: 3, reps: '8-12', cue: 'Elbows pinned to the sides, no swinging, lower for 2 seconds.' },
    { id: 'hammer-curl', name: 'Hammer Curl', muscle: 'Arms', equipment: 'Dumbbell', level: 'Beginner', sets: 3, reps: '10-12', cue: 'Neutral grip, control the negative.' },
    { id: 'tricep-pushdown', name: 'Triceps Pushdown', muscle: 'Arms', equipment: 'Cable', level: 'Beginner', sets: 3, reps: '12-15', cue: 'Elbows glued in, full lockout, squeeze the tris.' },
    { id: 'skull-crusher', name: 'Skull Crusher', muscle: 'Arms', equipment: 'Barbell', level: 'Intermediate', sets: 3, reps: '10-12', cue: 'Upper arms vertical, lower behind the head slowly.' },
    { id: 'close-pushup', name: 'Diamond Push-Up', muscle: 'Arms', equipment: 'Bodyweight', level: 'Intermediate', sets: 3, reps: '8-15', cue: 'Hands together under the chest, elbows brush the ribs.' },
    { id: 'chinup', name: 'Chin-Up', muscle: 'Arms', equipment: 'Bodyweight', level: 'Intermediate', sets: 3, reps: '5-10', cue: 'Underhand grip, pull chest to the bar, biceps heavy.' },

    // ---- Core ----
    { id: 'plank', name: 'Plank', muscle: 'Core', equipment: 'Bodyweight', level: 'Beginner', sets: 3, reps: '40-60s', cue: 'Squeeze glutes, pull the belly button in, breathe.' },
    { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', muscle: 'Core', equipment: 'Bodyweight', level: 'Advanced', sets: 3, reps: '10-15', cue: 'No swinging, curl the pelvis up, lower slowly.' },
    { id: 'cable-crunch', name: 'Cable Crunch', muscle: 'Core', equipment: 'Cable', level: 'Intermediate', sets: 3, reps: '12-15', cue: 'Crunch the ribs to the hips, hips stay still.' },
    { id: 'dead-bug', name: 'Dead Bug', muscle: 'Core', equipment: 'Bodyweight', level: 'Beginner', sets: 3, reps: '10 each', cue: 'Lower back flat on the floor the whole time.' },
    { id: 'russian-twist', name: 'Russian Twist', muscle: 'Core', equipment: 'Bodyweight', level: 'Beginner', sets: 3, reps: '20 total', cue: 'Rotate from the ribcage, chest stays tall.' },
    { id: 'side-plank', name: 'Side Plank', muscle: 'Core', equipment: 'Bodyweight', level: 'Beginner', sets: 3, reps: '30-45s each', cue: 'Stack the shoulders and hips, push the bottom elbow away.' },

    // ---- Cardio / full body ----
    { id: 'burpee', name: 'Burpee', muscle: 'Full Body', equipment: 'Bodyweight', level: 'Intermediate', sets: 4, reps: '10-15', cue: 'Chest to floor, jump tall, land soft.' },
    { id: 'jump-rope', name: 'Jump Rope', muscle: 'Cardio', equipment: 'Rope', level: 'Beginner', sets: 3, reps: '60s', cue: 'Small bounces from the wrists, stay light on the toes.' },
    { id: 'row-erg', name: 'Rowing Intervals', muscle: 'Cardio', equipment: 'Machine', level: 'Beginner', sets: 6, reps: '250m', cue: 'Legs, then hips, then arms. Reverse on the way back.' },
    { id: 'kb-swing', name: 'Kettlebell Swing', muscle: 'Full Body', equipment: 'Kettlebell', level: 'Intermediate', sets: 4, reps: '15-20', cue: 'Hips snap, arms are ropes, bell floats to chest height.' },
    { id: 'incline-treadmill', name: 'Incline Treadmill Walk', muscle: 'Cardio', equipment: 'Machine', level: 'Beginner', sets: 1, reps: '20-30 min', cue: '10-12% incline, brisk pace, do not hold the rails.' },
    { id: 'mountain-climber', name: 'Mountain Climber', muscle: 'Full Body', equipment: 'Bodyweight', level: 'Beginner', sets: 3, reps: '30-45s', cue: 'Hips low and steady, drive the knees fast.' }
  ];

  var PROGRAMS = [
    {
      id: 'full-body-3',
      name: 'Full Body Foundation',
      tag: 'Beginner · 3 days/week',
      level: 'Beginner',
      weeks: 8,
      summary: 'The fastest way to build a base: three full-body sessions, big compound lifts, simple progression.',
      days: [
        { name: 'Day A — Squat Focus', items: [['squat', 4, '5-8'], ['db-press', 4, '8-12'], ['seated-row', 3, '10-12'], ['db-lateral', 3, '12-15'], ['plank', 3, '40s']] },
        { name: 'Day B — Hinge Focus', items: [['rdl', 4, '8-10'], ['ohp', 4, '6-8'], ['lat-pulldown', 3, '10-12'], ['leg-curl', 3, '12-15'], ['dead-bug', 3, '10 each']] },
        { name: 'Day C — Push / Pull', items: [['goblet-squat', 3, '12-15'], ['pushup', 3, '10-15'], ['db-row', 3, '10-12'], ['hammer-curl', 3, '10-12'], ['tricep-pushdown', 3, '12-15']] }
      ]
    },
    {
      id: 'ppl',
      name: 'Push Pull Legs',
      tag: 'Intermediate · 6 days/week',
      level: 'Intermediate',
      weeks: 12,
      summary: 'The classic hypertrophy split. High volume, high frequency — pair it with good sleep and food.',
      days: [
        { name: 'Push', items: [['bench-press', 4, '6-8'], ['incline-db-press', 3, '8-12'], ['ohp', 3, '6-8'], ['db-lateral', 3, '12-15'], ['tricep-pushdown', 3, '12-15']] },
        { name: 'Pull', items: [['deadlift', 3, '3-5'], ['pullup', 4, '5-10'], ['bb-row', 3, '8-10'], ['face-pull', 3, '15-20'], ['bb-curl', 3, '8-12']] },
        { name: 'Legs', items: [['squat', 4, '5-8'], ['rdl', 3, '8-10'], ['leg-press', 3, '10-15'], ['calf-raise', 4, '15-20'], ['cable-crunch', 3, '12-15']] }
      ]
    },
    {
      id: 'home-no-equipment',
      name: 'Home, No Equipment',
      tag: 'Beginner · 4 days/week',
      level: 'Beginner',
      weeks: 6,
      summary: 'Zero gear, zero excuses. Bodyweight circuits you can do in a hostel room or a hotel.',
      days: [
        { name: 'Upper Body', items: [['pushup', 4, '10-20'], ['pike-pushup', 3, '8-12'], ['inverted-row', 3, '10-15'], ['close-pushup', 3, '8-15'], ['plank', 3, '45s']] },
        { name: 'Lower Body', items: [['goblet-squat', 0, ''], ['lunge', 3, '10 each'], ['hip-thrust', 3, '12-15'], ['calf-raise', 3, '20'], ['side-plank', 3, '30s each']] },
        { name: 'Conditioning', items: [['burpee', 4, '10-15'], ['mountain-climber', 3, '30-45s'], ['jump-rope', 3, '60s'], ['russian-twist', 3, '20 total']] },
        { name: 'Mobility & Core', items: [['dead-bug', 3, '10 each'], ['plank', 3, '45s'], ['hanging-leg-raise', 3, '8-12'], ['incline-treadmill', 1, '20 min']] }
      ]
    },
    {
      id: 'shred',
      name: 'Cut & Condition',
      tag: 'Intermediate · 4 days/week',
      level: 'Intermediate',
      weeks: 8,
      summary: 'Keep the muscle, drop the fat. Two strength days, two conditioning days, plus daily steps.',
      days: [
        { name: 'Strength A', items: [['squat', 4, '6-8'], ['db-press', 3, '8-12'], ['db-row', 3, '10-12'], ['kb-swing', 3, '15-20']] },
        { name: 'Conditioning A', items: [['row-erg', 6, '250m'], ['mountain-climber', 3, '40s'], ['plank', 3, '45s']] },
        { name: 'Strength B', items: [['deadlift', 4, '4-6'], ['ohp', 3, '6-8'], ['lat-pulldown', 3, '10-12'], ['lunge', 3, '10 each']] },
        { name: 'Conditioning B', items: [['burpee', 5, '12'], ['jump-rope', 4, '60s'], ['russian-twist', 3, '20 total']] }
      ]
    }
  ];

  var EX_MAP = {};
  EXERCISES.forEach(function (e) { EX_MAP[e.id] = e; });

  var HOUSE_ADS = [
    { id: 'ad-protein', title: 'Fuel your gains', body: 'GymFlow Pro members get ad-free training and the full program library.', cta: 'See Pro', url: '', weight: 3 },
    { id: 'ad-hydrate', title: 'Hydration check', body: '2% dehydration can cost you 10% of your strength. Log a glass now.', cta: 'Log water', url: '', weight: 2 },
    { id: 'ad-recovery', title: 'Recovery is training', body: 'Sleep 7-9 hours. Muscles are built while you rest, not while you lift.', cta: 'Ok', url: '', weight: 2 },
    { id: 'ad-programs', title: 'New program unlocked', body: 'Push Pull Legs, Cut & Condition and more inside the Workout tab.', cta: 'Browse', url: '', weight: 1 }
  ];

  global.GymData = { EXERCISES: EXERCISES, PROGRAMS: PROGRAMS, EX_MAP: EX_MAP, HOUSE_ADS: HOUSE_ADS };
})(window);
