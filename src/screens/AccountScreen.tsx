import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';

export function AccountScreen() {
  const { user, loading, login, logout, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.cyan} size="large" />;

  if (user) {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.username}>{user.username}</Text>
          {user.email && <Text style={styles.email}>{user.email}</Text>}
        </View>
        <Pressable onPress={() => void logout()} style={styles.outlineButton}><Text style={styles.outlineText}>Sign Out</Text></Pressable>
      </View>
    );
  }

  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (registering) {
        const step = await register(email, password, username);
        Alert.alert('Account created', step === 'CONFIRM_SIGN_UP' ? 'Check your email for the verification code. Complete verification on the website for this first release.' : 'You can now sign in.');
        setRegistering(false);
      } else {
        await login(email, password);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed.');
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.content}>
      <Text style={styles.title}>{registering ? 'Create Account' : 'Welcome Back'}</Text>
      <Text style={styles.subtitle}>{registering ? 'Use the same account on web and mobile.' : 'Sign in with your existing Yahtzee account.'}</Text>
      {registering && <TextInput value={username} onChangeText={setUsername} placeholder="Display name" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" />}
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} style={styles.input} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.muted} style={styles.input} secureTextEntry autoComplete={registering ? 'new-password' : 'current-password'} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable disabled={busy} onPress={() => void submit()} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Please wait…' : registering ? 'Create Account' : 'Sign In'}</Text></Pressable>
      <Pressable onPress={() => { setRegistering((value) => !value); setError(''); }}><Text style={styles.switchText}>{registering ? 'Already registered? Sign in' : 'New here? Create an account'}</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  loader: { flex: 1 },
  title: { color: colors.yellow, fontSize: 30, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.mint, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  input: { backgroundColor: colors.surface, color: colors.white, borderColor: colors.cyan, borderWidth: 1, borderRadius: 12, padding: 15, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: colors.cyan, padding: 15, borderRadius: 14, alignItems: 'center', marginTop: 6 },
  buttonText: { color: colors.background, fontWeight: '900', fontSize: 16 },
  error: { color: colors.danger, marginBottom: 8 },
  switchText: { color: colors.pink, textAlign: 'center', marginTop: 20, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderColor: colors.cyan, borderWidth: 1, borderRadius: 16, padding: 24, marginVertical: 28, alignItems: 'center' },
  label: { color: colors.muted },
  username: { color: colors.yellow, fontSize: 24, fontWeight: '900', marginTop: 8 },
  email: { color: colors.mint, marginTop: 6 },
  outlineButton: { borderColor: colors.pink, borderWidth: 1, borderRadius: 14, padding: 15, alignItems: 'center' },
  outlineText: { color: colors.pink, fontWeight: '800' },
});
