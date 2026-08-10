import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';
import { getMyProfile, updateMyPreferences, updateMyProfile, usernameAvailable } from '../services/profiles';

type Mode = 'login' | 'register' | 'confirm' | 'requestReset' | 'confirmReset';

interface AccountScreenProps {
  scoreSuggestionsEnabled?: boolean;
  onScoreSuggestionsChange?: (enabled: boolean) => void;
  remindersEnabled?: boolean;
  reminderHour?: number;
  onRemindersChange?: (enabled: boolean) => void;
  onReminderHourChange?: (hour: number) => void;
}

const displayHour = (hour: number) => `${hour % 12 || 12}:00 ${hour < 12 ? 'am' : 'pm'}`;
const validEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());
const validPassword = (value: string) => value.length >= 8;
const cleanCode = (value: string) => value.replace(/\D/g, '').slice(0, 6);
const maskedEmail = (value: string) => { const [name, domain] = value.trim().split('@'); return name && domain ? `${name[0]}${'•'.repeat(Math.min(4, Math.max(1, name.length - 1)))}@${domain}` : value; };
const friendlyAuthError = (caught: unknown) => {
  if (!(caught instanceof Error)) return 'Something went wrong. Please try again.';
  if (caught.name === 'UsernameExistsException') return 'An account with this email already exists. Try signing in or resetting your password.';
  if (caught.name === 'CodeMismatchException') return 'That code is incorrect. Check the email and try again.';
  if (caught.name === 'ExpiredCodeException') return 'That code has expired. Request a new one below.';
  if (caught.name === 'LimitExceededException') return 'Too many attempts. Please wait a little while and try again.';
  if (caught.name === 'NotAuthorizedException') return 'The email or password is incorrect.';
  if (caught.name === 'UserNotFoundException') return 'No account was found for that email.';
  if (caught.name === 'InvalidPasswordException') return 'Use a password with at least 8 characters.';
  if (caught.name === 'UserNotConfirmedException') return 'Your email still needs to be verified. Request a new code below.';
  return caught.message || 'Something went wrong. Please try again.';
};

export function AccountScreen({ scoreSuggestionsEnabled = true, onScoreSuggestionsChange, remindersEnabled = false, reminderHour = 19, onRemindersChange, onReminderHourChange }: AccountScreenProps) {
  const auth = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState(''); const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [oldPassword, setOldPassword] = useState(''); const [newPassword, setNewPassword] = useState('');
  const [showManagementPasswords, setShowManagementPasswords] = useState(false);
  const [managementError, setManagementError] = useState(''); const [managementBusy, setManagementBusy] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => { if (auth.user) { setUsername(auth.user.username); setFirstName(auth.user.firstName ?? ''); setLastName(auth.user.lastName ?? ''); } }, [auth.user]);
  useEffect(() => { if (!auth.user) return; void getMyProfile().then((profile) => { onScoreSuggestionsChange?.(profile.scoreSuggestionsEnabled); onRemindersChange?.(profile.dailyReminderEnabled); onReminderHourChange?.(profile.dailyReminderHour); }).catch(() => undefined); }, [auth.user]);
  const savePreferences = (suggestions: boolean, reminders: boolean, hour: number) => { if (auth.user) void updateMyPreferences(suggestions, reminders, hour).catch(() => setManagementError('Your preference changed on this device, but could not be synced.')); };
  useEffect(() => { if (!resendSeconds) return; const timer = setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000); return () => clearInterval(timer); }, [resendSeconds]);

  const saveProfile = async () => {
    Keyboard.dismiss();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username.trim())) return setProfileError('Username must be 3–20 letters, numbers or underscores.');
    if (!firstName.trim() || !lastName.trim()) return setProfileError('First name and surname are required.');
    setManagementBusy(true); setProfileError('');
    try { await updateMyProfile(username.trim(), firstName.trim(), lastName.trim()); await auth.refreshUser(); setEditingProfile(false); Alert.alert('Profile updated', 'Your public username and private name details have been saved.'); }
    catch (caught) { setProfileError(caught instanceof Error ? caught.message : 'Unable to update profile.'); setTimeout(() => scrollRef.current?.scrollTo({ y: 300, animated: true }), 50); }
    finally { setManagementBusy(false); }
  };

  const focusProfileField = () => setTimeout(() => scrollRef.current?.scrollTo({ y: 300, animated: true }), 100);

  const changePassword = async () => {
    if (!oldPassword || !newPassword) return setManagementError('Enter your current and new passwords.');
    setManagementBusy(true); setManagementError('');
    try {
      await auth.changePassword(oldPassword, newPassword);
      setOldPassword(''); setNewPassword(''); setShowPasswordChange(false);
      Alert.alert('Password changed', 'Your new password is ready to use.');
    } catch (caught) { setManagementError(caught instanceof Error ? caught.message : 'Unable to change password.'); }
    finally { setManagementBusy(false); }
  };

  const confirmSignOut = () => Alert.alert(
    'Sign out?',
    'You will need to enter your email and password to sign in again.',
    [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => void auth.logout() },
    ],
  );

  const deleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') return;
    setManagementBusy(true); setManagementError('');
    try {
      await auth.deleteAccount();
      setShowDeleteConfirmation(false); setDeleteConfirmation('');
    } catch (caught) {
      setManagementError(caught instanceof Error ? caught.message : 'Unable to delete account.');
      setShowDeleteConfirmation(false);
    } finally { setManagementBusy(false); }
  };

  if (auth.loading) return <ActivityIndicator style={styles.loader} color={colors.cyan} size="large" />;
  if (auth.user) return <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets contentContainerStyle={styles.content}>
    <View style={styles.profileCard}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{auth.user.username.charAt(0).toUpperCase()}</Text></View>
      <View style={styles.profileDetails}>
        <Text style={styles.username}>{auth.user.username}</Text>
        {auth.user.email && <Text numberOfLines={1} style={styles.email}>{auth.user.email}</Text>}
        <View style={styles.statusRow}><View style={styles.statusDot} /><Text style={styles.statusText}>Signed in</Text></View>
      </View>
    </View>

    <Text style={styles.sectionTitle}>Profile</Text>
    <Text style={styles.sectionDescription}>Your username is public and unique. Your first name and surname remain private.</Text>
    <Pressable onPress={() => { Keyboard.dismiss(); setProfileError(''); setEditingProfile((value) => !value); }} style={styles.actionGroup}><View style={styles.actionRow}><View style={styles.actionIcon}><Ionicons name="person-outline" size={21} color={colors.cyan} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>Edit profile</Text><Text style={styles.actionDescription}>{auth.user.firstName && auth.user.lastName ? `${auth.user.firstName} ${auth.user.lastName}` : 'Add your private name details'}</Text></View><Ionicons name={editingProfile ? 'chevron-up' : 'chevron-forward'} size={20} color={colors.muted} /></View></Pressable>
    {editingProfile && <View style={styles.managementPanel}>
      <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>Username</Text><Text style={styles.fieldHint}>Public · 3–20 letters, numbers or underscores</Text><TextInput value={username} onChangeText={(value) => { setUsername(value); setProfileError(''); }} onFocus={focusProfileField} placeholder="Choose a username" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} returnKeyType="next" style={[styles.input, styles.profileInput]} /></View>
      <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>First name</Text><Text style={styles.fieldHint}>Private</Text><TextInput value={firstName} onChangeText={(value) => { setFirstName(value); setProfileError(''); }} onFocus={focusProfileField} placeholder="Enter your first name" placeholderTextColor={colors.muted} autoCapitalize="words" returnKeyType="next" style={[styles.input, styles.profileInput]} /></View>
      <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>Surname</Text><Text style={styles.fieldHint}>Private</Text><TextInput value={lastName} onChangeText={(value) => { setLastName(value); setProfileError(''); }} onFocus={focusProfileField} onSubmitEditing={() => void saveProfile()} placeholder="Enter your surname" placeholderTextColor={colors.muted} autoCapitalize="words" returnKeyType="done" style={[styles.input, styles.profileInput]} /></View>
      {profileError ? <View style={styles.inlineError}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><Text style={styles.inlineErrorText}>{profileError}</Text></View> : null}
      <Pressable disabled={managementBusy} onPress={() => void saveProfile()} style={styles.button}><Text style={styles.buttonText}>{managementBusy ? 'Saving…' : 'Save Profile'}</Text></Pressable>
    </View>}

    <Text style={styles.sectionTitle}>Gameplay</Text>
    <Text style={styles.sectionDescription}>Choose how much guidance appears while you play.</Text>
    <View style={styles.preferenceRow}><View style={styles.actionIcon}><Ionicons name="sparkles-outline" size={21} color={colors.yellow} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>Score suggestions</Text><Text style={styles.actionDescription}>Highlight the recommended category and show “Best now”</Text></View><Switch accessibilityLabel="Score suggestions" value={scoreSuggestionsEnabled} onValueChange={(value) => { onScoreSuggestionsChange?.(value); savePreferences(value, remindersEnabled, reminderHour); }} trackColor={{ false: '#344247', true: '#315a5e' }} thumbColor={scoreSuggestionsEnabled ? colors.cyan : colors.muted} /></View>

    <Text style={styles.sectionTitle}>Notifications</Text>
    <Text style={styles.sectionDescription}>Get one local reminder when the Daily Challenge is waiting. Completed days are skipped.</Text>
    <View style={styles.notificationCard}><View style={styles.preferenceRowInner}><View style={styles.actionIcon}><Ionicons name="notifications-outline" size={21} color={colors.yellow} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>Daily Challenge reminder</Text><Text style={styles.actionDescription}>{displayHour(reminderHour)} in your local timezone</Text></View><Switch accessibilityLabel="Daily Challenge reminder" value={remindersEnabled} onValueChange={(value) => { onRemindersChange?.(value); savePreferences(scoreSuggestionsEnabled, value, reminderHour); }} trackColor={{ false: '#344247', true: '#315a5e' }} thumbColor={remindersEnabled ? colors.cyan : colors.muted} /></View>{remindersEnabled && <View style={styles.timeControl}><Pressable accessibilityLabel="Move reminder one hour earlier" onPress={() => { const hour = (reminderHour + 23) % 24; onReminderHourChange?.(hour); savePreferences(scoreSuggestionsEnabled, remindersEnabled, hour); }} style={styles.timeButton}><Ionicons name="remove" size={20} color={colors.cyan} /></Pressable><View><Text style={styles.timeValue}>{displayHour(reminderHour)}</Text><Text style={styles.timeLabel}>LOCAL TIME</Text></View><Pressable accessibilityLabel="Move reminder one hour later" onPress={() => { const hour = (reminderHour + 1) % 24; onReminderHourChange?.(hour); savePreferences(scoreSuggestionsEnabled, remindersEnabled, hour); }} style={styles.timeButton}><Ionicons name="add" size={20} color={colors.cyan} /></Pressable></View>}</View>

    <Text style={styles.sectionTitle}>Security & access</Text>
    <Text style={styles.sectionDescription}>This account is shared by the Yahtzee website and mobile app.</Text>
    <View style={styles.actionGroup}>
      <Pressable onPress={() => { setShowPasswordChange((value) => !value); setManagementError(''); }} style={styles.actionRow}>
        <View style={styles.actionIcon}><Ionicons name="shield-checkmark-outline" size={21} color={colors.cyan} /></View>
        <View style={styles.actionCopy}><Text style={styles.actionTitle}>Change password</Text><Text style={styles.actionDescription}>Update your Cognito sign-in password</Text></View>
        <Ionicons name={showPasswordChange ? 'chevron-up' : 'chevron-forward'} size={20} color={colors.muted} />
      </Pressable>
      <View style={styles.divider} />
      <Pressable onPress={confirmSignOut} style={styles.actionRow}>
        <View style={styles.actionIcon}><Ionicons name="log-out-outline" size={21} color={colors.pink} /></View>
        <View style={styles.actionCopy}><Text style={styles.actionTitle}>Sign out</Text><Text style={styles.actionDescription}>Sign out on this device</Text></View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>
    </View>
    {showPasswordChange && <View style={styles.managementPanel}>
      <View style={styles.passwordRow}><TextInput value={oldPassword} onChangeText={setOldPassword} placeholder="Current password" placeholderTextColor={colors.muted} style={styles.passwordInput} secureTextEntry={!showManagementPasswords} autoComplete="current-password" /><Pressable accessibilityLabel={showManagementPasswords ? 'Hide passwords' : 'Show passwords'} onPress={() => setShowManagementPasswords((value) => !value)} style={styles.eyeButton}><Ionicons name={showManagementPasswords ? 'eye-off-outline' : 'eye-outline'} size={21} color={colors.cyan} /></Pressable></View>
      <View style={styles.passwordRow}><TextInput value={newPassword} onChangeText={setNewPassword} placeholder="New password" placeholderTextColor={colors.muted} style={styles.passwordInput} secureTextEntry={!showManagementPasswords} autoComplete="new-password" /><Pressable accessibilityLabel={showManagementPasswords ? 'Hide passwords' : 'Show passwords'} onPress={() => setShowManagementPasswords((value) => !value)} style={styles.eyeButton}><Ionicons name={showManagementPasswords ? 'eye-off-outline' : 'eye-outline'} size={21} color={colors.cyan} /></Pressable></View>
      <Pressable disabled={managementBusy} onPress={() => void changePassword()} style={styles.button}><Text style={styles.buttonText}>{managementBusy ? 'Updating…' : 'Update Password'}</Text></Pressable>
    </View>}
    {managementError ? <Text style={[styles.error, { marginTop: 14 }]}>{managementError}</Text> : null}
    <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger zone</Text>
    <Pressable disabled={managementBusy} onPress={() => { setDeleteConfirmation(''); setShowDeleteConfirmation(true); }} style={styles.deleteButton}>
      <Ionicons name="trash-outline" size={21} color={colors.danger} />
      <View style={styles.actionCopy}><Text style={styles.deleteText}>Delete account</Text><Text style={styles.actionDescription}>Permanently remove your account</Text></View>
      <Ionicons name="chevron-forward" size={20} color={colors.danger} />
    </Pressable>
    <Modal transparent animationType="fade" visible={showDeleteConfirmation} onRequestClose={() => setShowDeleteConfirmation(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalIcon}><Ionicons name="warning-outline" size={28} color={colors.danger} /></View>
          <Text style={styles.modalTitle}>Delete account?</Text>
          <Text style={styles.modalCopy}>This permanently removes your Cognito account from both the app and website. This cannot be undone.</Text>
          <Text style={styles.confirmationLabel}>Type DELETE to confirm</Text>
          <TextInput value={deleteConfirmation} onChangeText={(value) => setDeleteConfirmation(value.toUpperCase())} placeholder="DELETE" placeholderTextColor={colors.muted} autoCapitalize="characters" autoCorrect={false} style={[styles.input, styles.confirmationInput]} />
          <View style={styles.modalActions}>
            <Pressable disabled={managementBusy} onPress={() => { setShowDeleteConfirmation(false); setDeleteConfirmation(''); }} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable disabled={managementBusy || deleteConfirmation !== 'DELETE'} onPress={() => void deleteAccount()} style={[styles.confirmDeleteButton, deleteConfirmation !== 'DELETE' && styles.disabledButton]}><Text style={styles.confirmDeleteText}>{managementBusy ? 'Deleting…' : 'Delete forever'}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </ScrollView>;

  const submit = async () => {
    Keyboard.dismiss(); setError('');
    if (!validEmail(email)) return setError('Enter a valid email address.');
    if ((mode === 'login' || mode === 'register' || mode === 'confirmReset') && !password) return setError('Enter your password.');
    if ((mode === 'register' || mode === 'confirmReset') && !validPassword(password)) return setError('Use a password with at least 8 characters.');
    if ((mode === 'register' || mode === 'confirmReset') && password !== confirmPassword) return setError('The passwords do not match.');
    if ((mode === 'confirm' || mode === 'confirmReset') && code.length !== 6) return setError('Enter the six-digit code from your email.');
    setBusy(true);
    try {
      if (mode === 'login') {
        const step = await auth.login(email, password);
        if (step === 'CONFIRM_SIGN_UP') {
          setCode(''); setResendSeconds(0); setMode('confirm');
        }
      }
      if (mode === 'register') {
        if (!/^[A-Za-z0-9_]{3,20}$/.test(username.trim())) throw new Error('Username must be 3–20 letters, numbers or underscores.');
        if (!firstName.trim() || !lastName.trim()) throw new Error('First name and surname are required.');
        if (!(await usernameAvailable(username.trim()))) throw new Error('That username is already taken.');
        const step = await auth.register(email, password, username, firstName, lastName);
        if (step === 'CONFIRM_SIGN_UP') { setConfirmPassword(''); setResendSeconds(30); setMode('confirm'); }
        else { Alert.alert('Account created', 'You can now sign in.'); setMode('login'); }
      }
      if (mode === 'confirm') {
        await auth.confirmRegistration(email, code);
        if (password) await auth.login(email, password);
        Alert.alert('You’re all set', password ? 'Your email is verified and your Yahtzee Hub account is ready.' : 'Your email is verified. You can now sign in.');
        setCode(''); setPassword('');
        if (!password) setMode('login');
      }
      if (mode === 'requestReset') { await auth.requestPasswordReset(email); setResendSeconds(30); setMode('confirmReset'); }
      if (mode === 'confirmReset') { await auth.finishPasswordReset(email, code, password); Alert.alert('Password updated', 'You can now sign in.'); setCode(''); setPassword(''); setMode('login'); }
    } catch (caught) { setError(friendlyAuthError(caught)); }
    finally { setBusy(false); }
  };

  const headings: Record<Mode, [string, string]> = {
    login: ['Welcome Back', 'Use your existing Yahtzee account.'], register: ['Create Account', 'Use it on both web and mobile.'],
    confirm: ['Verify Email', `We sent a six-digit code to ${maskedEmail(email)}.`], requestReset: ['Reset Password', 'Enter your account email and we’ll send a secure reset code.'],
    confirmReset: ['Choose Password', `Enter the code sent to ${maskedEmail(email)}, then choose a new password.`],
  };

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={styles.formIntro}><Text style={styles.formTitle}>{headings[mode][0]}</Text><Text style={styles.formSubtitle}>{headings[mode][1]}</Text></View>
    {mode === 'register' && <><Text style={styles.authLabel}>Public username</Text><TextInput value={username} onChangeText={setUsername} placeholder="3–20 letters, numbers or underscores" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" autoCorrect={false} /><Text style={styles.authLabel}>First name <Text style={styles.privateLabel}>PRIVATE</Text></Text><TextInput value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="words" /><Text style={styles.authLabel}>Surname <Text style={styles.privateLabel}>PRIVATE</Text></Text><TextInput value={lastName} onChangeText={setLastName} placeholder="Surname" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="words" /></>}
    <Text style={styles.authLabel}>Email</Text><TextInput value={email} onChangeText={(value) => { setEmail(value); setError(''); }} placeholder="you@example.com" placeholderTextColor={colors.muted} style={styles.input} keyboardType="email-address" textContentType="emailAddress" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={mode !== 'confirm' && mode !== 'confirmReset'} />
    {(mode === 'confirm' || mode === 'confirmReset') && <><Text style={styles.authLabel}>Six-digit code</Text><TextInput value={code} onChangeText={(value) => setCode(cleanCode(value))} placeholder="000000" placeholderTextColor={colors.muted} style={[styles.input, styles.codeInput]} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} /></>}
    {(mode === 'login' || mode === 'register' || mode === 'confirmReset') && <><Text style={styles.authLabel}>{mode === 'confirmReset' ? 'New password' : 'Password'}</Text><View style={styles.passwordRow}><TextInput value={password} onChangeText={(value) => { setPassword(value); setError(''); }} placeholder={mode === 'login' ? 'Enter your password' : 'At least 8 characters'} placeholderTextColor={colors.muted} style={styles.passwordInput} secureTextEntry={!showPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /><Pressable accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((value) => !value)} style={styles.eyeButton}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={colors.cyan} /></Pressable></View></>}
    {(mode === 'register' || mode === 'confirmReset') && <><Text style={styles.authLabel}>Confirm password</Text><TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter password" placeholderTextColor={colors.muted} style={styles.input} secureTextEntry={!showPassword} autoComplete="new-password" /><Text style={styles.passwordHint}>Use at least 8 characters.</Text></>}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable disabled={busy} onPress={() => void submit()} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : mode === 'requestReset' ? 'Send Reset Code' : mode === 'confirmReset' ? 'Reset Password' : 'Verify Email'}</Text></Pressable>
    {mode === 'confirm' && <Pressable disabled={busy || resendSeconds > 0} onPress={() => void auth.resendRegistrationCode(email).then(() => { setResendSeconds(30); Alert.alert('New code sent', `Check ${maskedEmail(email)}.`); }).catch((caught) => setError(friendlyAuthError(caught)))}><Text style={[styles.link, resendSeconds > 0 && styles.disabledLink]}>{resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend verification code'}</Text></Pressable>}
    {mode === 'confirmReset' && <Pressable disabled={busy || resendSeconds > 0} onPress={() => void auth.requestPasswordReset(email).then(() => { setResendSeconds(30); Alert.alert('New code sent', `Check ${maskedEmail(email)}.`); }).catch((caught) => setError(friendlyAuthError(caught)))}><Text style={[styles.link, resendSeconds > 0 && styles.disabledLink]}>{resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend reset code'}</Text></Pressable>}
    {(mode === 'confirm' || mode === 'confirmReset') && <Pressable onPress={() => { setCode(''); setError(''); setMode(mode === 'confirm' ? 'register' : 'requestReset'); }}><Text style={styles.link}>Use a different email</Text></Pressable>}
    {mode === 'login' && <><Pressable onPress={() => setMode('requestReset')}><Text style={styles.link}>Forgot password?</Text></Pressable><Pressable onPress={() => setMode('register')}><Text style={styles.link}>New here? Create an account</Text></Pressable></>}
    {mode !== 'login' && <Pressable onPress={() => { setMode('login'); setError(''); }}><Text style={styles.link}>Back to sign in</Text></Pressable>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 20, paddingBottom: 150 }, loader: { flex: 1 }, formIntro: { marginBottom: 20 }, formTitle: { color: colors.yellow, fontSize: 24, fontWeight: '900' }, formSubtitle: { color: colors.mint, fontSize: 12, lineHeight: 18, marginTop: 4 },
  input: { backgroundColor: colors.surface, color: colors.white, borderColor: colors.cyan, borderWidth: 1, borderRadius: 12, padding: 15, marginBottom: 12, fontSize: 16, letterSpacing: 0 }, authLabel: { color: colors.mint, fontSize: 12, fontWeight: '900', marginBottom: 6 }, privateLabel: { color: colors.muted, fontSize: 8 }, passwordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.cyan, borderWidth: 1, borderRadius: 12, marginBottom: 12 }, passwordInput: { flex: 1, color: colors.white, padding: 15, fontSize: 16, letterSpacing: 0 }, eyeButton: { width: 50, minHeight: 50, alignItems: 'center', justifyContent: 'center' }, codeInput: { textAlign: 'center', letterSpacing: 10, fontSize: 22, fontWeight: '900' }, passwordHint: { color: colors.muted, fontSize: 11, marginTop: -5, marginBottom: 12 }, button: { backgroundColor: colors.cyan, padding: 15, borderRadius: 14, alignItems: 'center', marginTop: 6 }, buttonText: { color: colors.background, fontWeight: '900', fontSize: 16 }, error: { color: colors.danger, marginBottom: 8 }, link: { color: colors.pink, textAlign: 'center', marginTop: 18, fontWeight: '700' }, disabledLink: { color: colors.muted },
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 2 },
  preferenceRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 13, padding: 12 },
  notificationCard: { backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 13, padding: 12 }, preferenceRowInner: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 }, timeControl: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, paddingHorizontal: 12, borderTopColor: '#2d3c40', borderTopWidth: 1 }, timeButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderColor: '#315a5e', borderWidth: 1, backgroundColor: colors.background }, timeValue: { color: colors.yellow, fontSize: 17, fontWeight: '900', textAlign: 'center' }, timeLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginTop: 2 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#20383b', borderColor: colors.cyan, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.cyan, fontSize: 25, fontWeight: '900' },
  profileDetails: { flex: 1, marginLeft: 15 }, username: { color: colors.yellow, fontSize: 22, fontWeight: '900' }, email: { color: colors.mint, marginTop: 3 }, statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.cyan, marginRight: 6 }, statusText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  sectionTitle: { color: colors.cyan, fontSize: 19, fontWeight: '900', marginTop: 28, marginBottom: 8 }, sectionDescription: { color: colors.mint, lineHeight: 21, marginBottom: 17 },
  actionGroup: { backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 16, overflow: 'hidden' }, actionRow: { flexDirection: 'row', alignItems: 'center', padding: 15 }, actionIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#182326', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, actionCopy: { flex: 1 }, actionTitle: { color: colors.white, fontSize: 16, fontWeight: '800' }, actionDescription: { color: colors.muted, fontSize: 12, marginTop: 3 }, divider: { height: 1, backgroundColor: '#263337', marginLeft: 65 },
  managementPanel: { backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 14 }, fieldGroup: { marginBottom: 17 }, fieldLabel: { color: colors.white, fontSize: 14, fontWeight: '900', marginBottom: 3 }, fieldHint: { color: colors.muted, fontSize: 12, marginBottom: 8 }, profileInput: { marginBottom: 0 }, dangerTitle: { color: colors.danger }, deleteButton: { flexDirection: 'row', alignItems: 'center', borderColor: colors.danger, borderWidth: 1, borderRadius: 14, padding: 15 }, deleteText: { color: colors.danger, fontWeight: '900', fontSize: 15, marginLeft: 12 },
  inlineError: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#321b20', borderColor: colors.danger, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 7 }, inlineErrorText: { color: colors.danger, flex: 1, lineHeight: 19, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 }, modalCard: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderColor: colors.danger, borderWidth: 1, borderRadius: 20, padding: 20 }, modalIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#321b20', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, modalTitle: { color: colors.danger, fontSize: 23, fontWeight: '900', textAlign: 'center', marginTop: 12 }, modalCopy: { color: colors.mint, textAlign: 'center', lineHeight: 21, marginTop: 9 }, confirmationLabel: { color: colors.white, fontWeight: '800', marginTop: 20, marginBottom: 8 }, confirmationInput: { borderColor: colors.danger, textAlign: 'center', letterSpacing: 3, fontWeight: '900' }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 5 }, cancelButton: { flex: 1, borderColor: '#405055', borderWidth: 1, borderRadius: 12, padding: 13, alignItems: 'center' }, cancelText: { color: colors.white, fontWeight: '800' }, confirmDeleteButton: { flex: 1.35, backgroundColor: colors.danger, borderRadius: 12, padding: 13, alignItems: 'center' }, confirmDeleteText: { color: colors.background, fontWeight: '900' }, disabledButton: { opacity: 0.35 },
});
