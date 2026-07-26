export const colors = {
  background: '#080b0c',
  surface: '#111719',
  cyan: '#00f0f0',
  pink: '#ff00d4',
  yellow: '#f4ff00',
  mint: '#afffe3',
  muted: '#819194',
  danger: '#ff6b78',
  white: '#ffffff',
};

export const playerProfiles = [
  { accent: '#00f0f0', score: '#f4ff00', soft: '#173033' },
  { accent: '#5cff88', score: '#9dffb7', soft: '#173322' },
  { accent: '#ff00d4', score: '#ff72e7', soft: '#34202f' },
  { accent: '#a78bfa', score: '#c4b5fd', soft: '#27213b' },
  { accent: '#ff9f43', score: '#ffc078', soft: '#392819' },
  { accent: '#5da9ff', score: '#9bcbff', soft: '#182b40' },
] as const;

export const computerProfile = playerProfiles[1];
