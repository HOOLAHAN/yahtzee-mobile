import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';

type Mode = 'login' | 'register' | 'confirm' | 'requestReset' | 'confirmReset';

export function AccountScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [username, setUsername] = useState(''); const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');

  if (auth.loading) return <ActivityIndicator style={styles.loader} color={colors.cyan} size="large" />;
  if (auth.user) return <ScrollView contentContainerStyle={styles.content}><Text style={styles.title}>Account</Text><View style={styles.card}><Text style={styles.label}>Signed in as</Text><Text style={styles.username}>{auth.user.username}</Text>{auth.user.email && <Text style={styles.email}>{auth.user.email}</Text>}</View><Text style={styles.aboutTitle}>Shared Account</Text><Text style={styles.about}>Your web and mobile games use the same Cognito account and leaderboard.</Text><Pressable onPress={() => void auth.logout()} style={styles.outlineButton}><Text style={styles.outlineText}>Sign Out</Text></Pressable></ScrollView>;

  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (mode === 'login') await auth.login(email, password);
      if (mode === 'register') {
        const step = await auth.register(email, password, username);
        if (step === 'CONFIRM_SIGN_UP') { setPassword(''); setMode('confirm'); }
        else { Alert.alert('Account created', 'You can now sign in.'); setMode('login'); }
      }
      if (mode === 'confirm') { await auth.confirmRegistration(email, code); Alert.alert('Email verified', 'You can now sign in.'); setCode(''); setMode('login'); }
      if (mode === 'requestReset') { await auth.requestPasswordReset(email); setMode('confirmReset'); }
      if (mode === 'confirmReset') { await auth.finishPasswordReset(email, code, password); Alert.alert('Password updated', 'You can now sign in.'); setCode(''); setPassword(''); setMode('login'); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  };

  const headings: Record<Mode, [string, string]> = {
    login: ['Welcome Back', 'Use your existing Yahtzee account.'], register: ['Create Account', 'Use it on both web and mobile.'],
    confirm: ['Verify Email', 'Enter the code sent to your email.'], requestReset: ['Reset Password', 'We will email you a reset code.'],
    confirmReset: ['Choose Password', 'Enter your code and new password.'],
  };

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text style={styles.title}>{headings[mode][0]}</Text><Text style={styles.subtitle}>{headings[mode][1]}</Text>
    {mode === 'register' && <TextInput value={username} onChangeText={setUsername} placeholder="Display name" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" />}
    <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} style={styles.input} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={mode !== 'confirm' && mode !== 'confirmReset'} />
    {(mode === 'confirm' || mode === 'confirmReset') && <TextInput value={code} onChangeText={setCode} placeholder="Verification code" placeholderTextColor={colors.muted} style={styles.input} keyboardType="number-pad" />}
    {(mode === 'login' || mode === 'register' || mode === 'confirmReset') && <TextInput value={password} onChangeText={setPassword} placeholder={mode === 'confirmReset' ? 'New password' : 'Password'} placeholderTextColor={colors.muted} style={styles.input} secureTextEntry />}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable disabled={busy} onPress={() => void submit()} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : mode === 'requestReset' ? 'Send Reset Code' : mode === 'confirmReset' ? 'Reset Password' : 'Verify Email'}</Text></Pressable>
    {mode === 'confirm' && <Pressable onPress={() => void auth.resendRegistrationCode(email).then(() => Alert.alert('Code sent')).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to resend code.'))}><Text style={styles.link}>Resend verification code</Text></Pressable>}
    {mode === 'login' && <><Pressable onPress={() => setMode('requestReset')}><Text style={styles.link}>Forgot password?</Text></Pressable><Pressable onPress={() => setMode('register')}><Text style={styles.link}>New here? Create an account</Text></Pressable></>}
    {mode !== 'login' && <Pressable onPress={() => { setMode('login'); setError(''); }}><Text style={styles.link}>Back to sign in</Text></Pressable>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 24, justifyContent: 'center' }, loader: { flex: 1 }, title: { color: colors.yellow, fontSize: 30, fontWeight: '900', textAlign: 'center' }, subtitle: { color: colors.mint, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  input: { backgroundColor: colors.surface, color: colors.white, borderColor: colors.cyan, borderWidth: 1, borderRadius: 12, padding: 15, marginBottom: 12, fontSize: 16 }, button: { backgroundColor: colors.cyan, padding: 15, borderRadius: 14, alignItems: 'center', marginTop: 6 }, buttonText: { color: colors.background, fontWeight: '900', fontSize: 16 }, error: { color: colors.danger, marginBottom: 8 }, link: { color: colors.pink, textAlign: 'center', marginTop: 18, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderColor: colors.cyan, borderWidth: 1, borderRadius: 16, padding: 24, marginVertical: 28, alignItems: 'center' }, label: { color: colors.muted }, username: { color: colors.yellow, fontSize: 24, fontWeight: '900', marginTop: 8 }, email: { color: colors.mint, marginTop: 6 }, outlineButton: { borderColor: colors.pink, borderWidth: 1, borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 24 }, outlineText: { color: colors.pink, fontWeight: '800' }, aboutTitle: { color: colors.cyan, fontSize: 20, fontWeight: '900' }, about: { color: colors.mint, lineHeight: 21, marginTop: 8 },
});
