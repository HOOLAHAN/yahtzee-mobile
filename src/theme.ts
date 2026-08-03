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
  { accent: '#ff6577', score: '#ff9ca7', soft: '#3a1d24' },
  { accent: '#5ee7ff', score: '#a4f2ff', soft: '#163039' },
  { accent: '#84cc16', score: '#bef264', soft: '#233116' },
  { accent: '#f472b6', score: '#f9a8d4', soft: '#392033' },
] as const;

export const computerProfile = playerProfiles[1];
