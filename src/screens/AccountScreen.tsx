import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';
import { updateMyProfile, usernameAvailable } from '../services/profiles';

type Mode = 'login' | 'register' | 'confirm' | 'requestReset' | 'confirmReset';

export function AccountScreen({ scoreSuggestionsEnabled = true, onScoreSuggestionsChange }: { scoreSuggestionsEnabled?: boolean; onScoreSuggestionsChange?: (enabled: boolean) => void }) {
  const auth = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [username, setUsername] = useState(''); const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [oldPassword, setOldPassword] = useState(''); const [newPassword, setNewPassword] = useState('');
  const [managementError, setManagementError] = useState(''); const [managementBusy, setManagementBusy] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => { if (auth.user) { setUsername(auth.user.username); setFirstName(auth.user.firstName ?? ''); setLastName(auth.user.lastName ?? ''); } }, [auth.user]);

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
    <View style={styles.preferenceRow}><View style={styles.actionIcon}><Ionicons name="sparkles-outline" size={21} color={colors.yellow} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>Score suggestions</Text><Text style={styles.actionDescription}>Highlight the recommended category and show “Best now”</Text></View><Switch accessibilityLabel="Score suggestions" value={scoreSuggestionsEnabled} onValueChange={onScoreSuggestionsChange} trackColor={{ false: '#344247', true: '#315a5e' }} thumbColor={scoreSuggestionsEnabled ? colors.cyan : colors.muted} /></View>

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
      <TextInput value={oldPassword} onChangeText={setOldPassword} placeholder="Current password" placeholderTextColor={colors.muted} style={styles.input} secureTextEntry autoComplete="current-password" />
      <TextInput value={newPassword} onChangeText={setNewPassword} placeholder="New password" placeholderTextColor={colors.muted} style={styles.input} secureTextEntry autoComplete="new-password" />
      <Pressable disabled={managementBusy} onPress={() => void changePassword()} style={styles.button}><Text style={styles.buttonText}>{managementBusy ? 'Updating…' : 'Update Password'}</Text></Pressable>
    </View>}
    {managementError ? <Text style={styles.error}>{managementError}</Text> : null}
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
    setBusy(true); setError('');
    try {
      if (mode === 'login') await auth.login(email, password);
      if (mode === 'register') {
        if (!/^[A-Za-z0-9_]{3,20}$/.test(username.trim())) throw new Error('Username must be 3–20 letters, numbers or underscores.');
        if (!firstName.trim() || !lastName.trim()) throw new Error('First name and surname are required.');
        if (!(await usernameAvailable(username.trim()))) throw new Error('That username is already taken.');
        const step = await auth.register(email, password, username, firstName, lastName);
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
    <View style={styles.formIntro}><Text style={styles.formTitle}>{headings[mode][0]}</Text><Text style={styles.formSubtitle}>{headings[mode][1]}</Text></View>
    {mode === 'register' && <><TextInput value={username} onChangeText={setUsername} placeholder="Unique username" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" autoCorrect={false} /><TextInput value={firstName} onChangeText={setFirstName} placeholder="First name (private)" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="words" /><TextInput value={lastName} onChangeText={setLastName} placeholder="Surname (private)" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="words" /></>}
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
  content: { flexGrow: 1, padding: 20, paddingBottom: 150 }, loader: { flex: 1 }, formIntro: { marginBottom: 20 }, formTitle: { color: colors.yellow, fontSize: 24, fontWeight: '900' }, formSubtitle: { color: colors.mint, fontSize: 12, lineHeight: 18, marginTop: 4 },
  input: { backgroundColor: colors.surface, color: colors.white, borderColor: colors.cyan, borderWidth: 1, borderRadius: 12, padding: 15, marginBottom: 12, fontSize: 16 }, button: { backgroundColor: colors.cyan, padding: 15, borderRadius: 14, alignItems: 'center', marginTop: 6 }, buttonText: { color: colors.background, fontWeight: '900', fontSize: 16 }, error: { color: colors.danger, marginBottom: 8 }, link: { color: colors.pink, textAlign: 'center', marginTop: 18, fontWeight: '700' },
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 2 },
  preferenceRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 13, padding: 12 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#20383b', borderColor: colors.cyan, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.cyan, fontSize: 25, fontWeight: '900' },
  profileDetails: { flex: 1, marginLeft: 15 }, username: { color: colors.yellow, fontSize: 22, fontWeight: '900' }, email: { color: colors.mint, marginTop: 3 }, statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.cyan, marginRight: 6 }, statusText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  sectionTitle: { color: colors.cyan, fontSize: 19, fontWeight: '900', marginTop: 28, marginBottom: 8 }, sectionDescription: { color: colors.mint, lineHeight: 21, marginBottom: 17 },
  actionGroup: { backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 16, overflow: 'hidden' }, actionRow: { flexDirection: 'row', alignItems: 'center', padding: 15 }, actionIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#182326', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, actionCopy: { flex: 1 }, actionTitle: { color: colors.white, fontSize: 16, fontWeight: '800' }, actionDescription: { color: colors.muted, fontSize: 12, marginTop: 3 }, divider: { height: 1, backgroundColor: '#263337', marginLeft: 65 },
  managementPanel: { backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 14 }, fieldGroup: { marginBottom: 17 }, fieldLabel: { color: colors.white, fontSize: 14, fontWeight: '900', marginBottom: 3 }, fieldHint: { color: colors.muted, fontSize: 12, marginBottom: 8 }, profileInput: { marginBottom: 0 }, dangerTitle: { color: colors.danger }, deleteButton: { flexDirection: 'row', alignItems: 'center', borderColor: colors.danger, borderWidth: 1, borderRadius: 14, padding: 15 }, deleteText: { color: colors.danger, fontWeight: '900', fontSize: 15, marginLeft: 12 },
  inlineError: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#321b20', borderColor: colors.danger, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 7 }, inlineErrorText: { color: colors.danger, flex: 1, lineHeight: 19, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 }, modalCard: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderColor: colors.danger, borderWidth: 1, borderRadius: 20, padding: 20 }, modalIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#321b20', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, modalTitle: { color: colors.danger, fontSize: 23, fontWeight: '900', textAlign: 'center', marginTop: 12 }, modalCopy: { color: colors.mint, textAlign: 'center', lineHeight: 21, marginTop: 9 }, confirmationLabel: { color: colors.white, fontWeight: '800', marginTop: 20, marginBottom: 8 }, confirmationInput: { borderColor: colors.danger, textAlign: 'center', letterSpacing: 3, fontWeight: '900' }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 5 }, cancelButton: { flex: 1, borderColor: '#405055', borderWidth: 1, borderRadius: 12, padding: 13, alignItems: 'center' }, cancelText: { color: colors.white, fontWeight: '800' }, confirmDeleteButton: { flex: 1.35, backgroundColor: colors.danger, borderRadius: 12, padding: 13, alignItems: 'center' }, confirmDeleteText: { color: colors.background, fontWeight: '900' }, disabledButton: { opacity: 0.35 },
});
