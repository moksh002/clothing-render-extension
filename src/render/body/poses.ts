// Poses as bone rotations in degrees, about world axes through each bone's joint in the rest (A) pose.
// x points to one side of the body, y up, z forward. Rotation about x swings a limb forward (negative) or
// back (positive); about z swings it out to the side (positive on the +x side).

export type Euler = [number, number, number];

export interface Pose {
  id: string;
  label: string;
  /** Rotations for bones on the body's +x side, the -x side, and the centre line, by bone base name. */
  plus: Record<string, Euler>;
  minus: Record<string, Euler>;
  center: Record<string, Euler>;
}

/** The same rotation seen in a mirror: swings about y and z flip sign. */
export const mirror = (e: Euler): Euler => [e[0], -e[1], -e[2]];

function symmetric(id: string, label: string, plus: Record<string, Euler>, center: Record<string, Euler> = {}): Pose {
  return {
    id,
    label,
    plus,
    minus: Object.fromEntries(Object.entries(plus).map(([k, v]) => [k, mirror(v)])),
    center,
  };
}

export const POSES: Pose[] = [
  symmetric('a-pose', 'A-pose', {}),
  symmetric('relaxed', 'Relaxed', {
    'upperarm01': [0, 0, -30],
    'lowerarm01': [-10, 0, 0],
  }),
  symmetric('hands-on-hips', 'Hands on hips', {
    'upperarm01': [8, 0, -4],
    'lowerarm01': [-10, 0, -82],
  }),
  {
    id: 'walking',
    label: 'Walking',
    plus: {
      upperleg01: [-22, 0, 0],
      lowerleg01: [10, 0, 0],
      upperarm01: [20, 0, -30],
      lowerarm01: [-12, 0, 0],
    },
    minus: {
      upperleg01: [16, 0, 0],
      lowerleg01: [34, 0, 0],
      upperarm01: [-20, 0, 30],
      lowerarm01: [-28, 0, 0],
    },
    center: { spine02: [0, 6, 0] },
  },
  symmetric('t-pose', 'Arms out', { upperarm01: [0, 0, 42] }),
];

export const POSE_BY_ID = new Map(POSES.map((p) => [p.id, p]));
