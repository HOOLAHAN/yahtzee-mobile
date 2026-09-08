import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import { colors, playerProfiles } from '../theme';
import { sharedAppAchievementKey } from '../lib/achievements';
import { useState } from 'react';

const appStoreUrl = 'https://apps.apple.com/gb/app/yahtzee-hub/id6794910138';

const playModes: { title: string; description: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { title: 'Solo', description: 'Play a complete 13-round game, save your score and climb the leaderboard.', icon: 'person-outline', color: playerProfiles[0].accent },
  { title: 'Vs Computer', description: 'Battle an opponent that visibly rolls, holds combinations and makes strategic category choices.', icon: 'hardware-chip-outline', color: playerProfiles[1].accent },
  { title: 'Pass & Play', description: 'Share one device for a local two-player game with separate turns and scorecards.', icon: 'people-outline', color: playerProfiles[2].accent },
  { title: 'Real Dice', description: 'Use physical dice while the app tracks turns and scorecards for up to ten named players.', icon: 'calculator-outline', color: playerProfiles[3].accent },
];

const rules = [
  'Roll all five dice at the start of a turn.',
  'Tap dice to hold them before the next roll.',
  'Re-roll unheld dice up to two more times.',
  'Choose one unused category. Every category must be used once.',
];

const scoring = [
  ['Ones–Sixes', 'Add dice showing that number. Score 63 or more across this section for a 35-point bonus.'],
  ['Three/Four of a Kind', 'Score the total of all dice when enough values match.'],
  ['Full House', 'Three of one value and two of another scores 25.'],
  ['Small/Large Straight', 'Four or five consecutive values score 30 or 40.'],
  ['Yahtzee', 'Five matching dice score 50. Further Yahtzees can earn +100 and use the Joker rule explained below.'],
  ['Chance', 'Add all five dice.'],
];

export function AboutScreen() {
  const [showShareQr, setShowShareQr] = useState(false);
  const [showJokerRules, setShowJokerRules] = useState(false);
  const shareApp = async () => {
    const result = await Share.share({ title: 'Yahtzee Hub', message: `Play Yahtzee Hub with me — digital dice, scorecards, daily challenges and leaderboards. Get the app: ${appStoreUrl}`, url: appStoreUrl });
    if (result.action === Share.sharedAction) await AsyncStorage.setItem(sharedAppAchievementKey, 'true');
  };
  return <ScrollView contentContainerStyle={styles.content}>
    <View style={styles.hero}><View style={styles.heroIcon}><Ionicons name="dice-outline" size={30} color={colors.cyan} /></View><View style={styles.heroCopy}><Text style={styles.heroTitle}>Your complete Yahtzee companion</Text><Text style={styles.intro}>Play your way, return for a shared Daily Challenge, and track every milestone.</Text></View></View>
    <View style={styles.shareCard}>
      <View style={styles.shareCopy}><Text style={styles.shareTitle}>Bring someone to game night</Text><Text style={styles.shareDescription}>Let someone nearby scan the code, or send friends the App Store link. Available on iPhone and iPad today, with Android planned.</Text></View>
      {showShareQr && <View accessible accessibilityRole="image" accessibilityLabel="QR code for the Yahtzee Hub App Store page" style={styles.qrSection}>
        <View style={styles.qrFrame}><QRCode value={appStoreUrl} size={156} color="#071012" backgroundColor="#ffffff" /></View>
        <View style={styles.qrCopy}><Ionicons name="scan-outline" size={18} color={colors.cyan} /><View><Text style={styles.qrTitle}>Scan to download</Text><Text style={styles.qrHint}>Open with your phone camera</Text></View></View>
      </View>}
      <View style={styles.shareActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Send the Yahtzee Hub link" onPress={() => void shareApp()} style={styles.shareButton}><Ionicons name="send-outline" size={18} color={colors.background} /><Text style={styles.shareButtonText}>Send Link</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={showShareQr ? 'Hide the Yahtzee Hub QR code' : 'Show the Yahtzee Hub QR code'} accessibilityState={{ expanded: showShareQr }} onPress={() => setShowShareQr((visible) => !visible)} style={[styles.shareButton, styles.qrButton]}><Ionicons name={showShareQr ? 'close-outline' : 'qr-code-outline'} size={19} color={colors.yellow} /><Text style={[styles.shareButtonText, styles.qrButtonText]}>{showShareQr ? 'Hide QR' : 'Show QR'}</Text></Pressable>
      </View>
    </View>

    <Text style={styles.heading}>Daily Challenge</Text>
    <View style={styles.highlightCard}><Ionicons name="sunny-outline" size={28} color={colors.yellow} /><View style={styles.highlightCopy}><Text style={styles.highlightTitle}>A fresh shared game every day</Text><Text style={styles.highlightText}>Everyone receives the same candidate dice for each numbered roll. Your holds and category choices remain your own, so strategy decides the Daily leaderboard. Play once per local day and build your streak.</Text></View></View>

    <Text style={styles.heading}>Progress & Achievements</Text>
    <View style={styles.highlightCard}><Ionicons name="ribbon-outline" size={28} color={colors.pink} /><View style={styles.highlightCopy}><Text style={styles.highlightTitle}>More than a final score</Text><Text style={styles.highlightText}>Track games, personal bests, averages and Daily streaks. Unlock achievements for milestones, Yahtzees, straights, high scores and sharing the app. Tap any score in High Scores for its full breakdown.</Text></View></View>

    <Text style={styles.heading}>Ways to Play</Text>
    <View style={styles.modeGrid}>{playModes.map((mode) => <View key={mode.title} style={[styles.modeCard, { borderColor: mode.color }]}><View style={[styles.modeIcon, { backgroundColor: `${mode.color}1f` }]}><Ionicons name={mode.icon} size={21} color={mode.color} /></View><Text style={[styles.modeTitle, { color: mode.color }]}>{mode.title}</Text><Text style={styles.modeDescription}>{mode.description}</Text></View>)}</View>

    <Text style={styles.heading}>Built for Game Night</Text>
    <View style={styles.featureList}>
      <View style={styles.feature}><Ionicons name="list-outline" size={20} color={colors.cyan} /><View><Text style={styles.featureTitle}>Complete scorecards</Text><Text style={styles.featureCopy}>Track categories, upper bonus progress, totals, rounds and final standings.</Text></View></View>
      <View style={styles.feature}><Ionicons name="color-palette-outline" size={20} color={colors.pink} /><View><Text style={styles.featureTitle}>Player colour profiles</Text><Text style={styles.featureCopy}>Distinct neon identities make turns and multi-player scores easy to follow.</Text></View></View>
      <View style={styles.feature}><Ionicons name="save-outline" size={20} color={colors.yellow} /><View><Text style={styles.featureTitle}>Games are remembered</Text><Text style={styles.featureCopy}>Active digital and real-dice games survive closing the app. Real Dice also remembers player names.</Text></View></View>
      <View style={styles.feature}><Ionicons name="accessibility-outline" size={20} color={playerProfiles[1].accent} /><View><Text style={styles.featureTitle}>Accessible feedback</Text><Text style={styles.featureCopy}>Haptics, clear status messages, reduced-motion support and labelled controls keep play understandable.</Text></View></View>
    </View>

    <Text style={styles.heading}>How to Play</Text>
    {rules.map((rule, index) => <View key={rule} style={styles.ruleRow}><View style={styles.ruleNumber}><Text style={styles.ruleNumberText}>{index + 1}</Text></View><Text style={styles.rule}>{rule}</Text></View>)}

    <Text style={styles.heading}>Scoring Categories</Text>
    {scoring.map(([name, description]) => <View key={name} style={styles.scoringCard}><Text style={styles.name}>{name}</Text><Text style={styles.description}>{description}</Text></View>)}
    <View style={styles.jokerCard}>
      <Pressable accessibilityRole="button" accessibilityLabel="How Joker scoring works" accessibilityState={{ expanded: showJokerRules }} onPress={() => setShowJokerRules((visible) => !visible)} style={({ pressed }) => [styles.jokerHeader, pressed && styles.jokerPressed]}>
        <View style={styles.jokerIcon}><Ionicons name="sparkles" size={19} color={colors.yellow} /></View>
        <View style={styles.jokerHeaderCopy}><Text style={styles.jokerTitle}>Bonus Yahtzees & the Joker rule</Text><Text style={styles.jokerSummary}>See where an extra Yahtzee must be scored.</Text></View>
        <Ionicons name={showJokerRules ? 'chevron-up' : 'chevron-down'} size={19} color={colors.cyan} />
      </Pressable>
      {showJokerRules && <View style={styles.jokerDetails}>
        <Text style={styles.jokerIntro}>When you roll another Yahtzee after using the Yahtzee box:</Text>
        <View style={styles.jokerStep}><Text style={styles.jokerStepNumber}>1</Text><Text style={styles.jokerStepText}>If its matching Upper box is open, you must use it. Five Fours, for example, score 20 in Fours.</Text></View>
        <View style={styles.jokerStep}><Text style={styles.jokerStepNumber}>2</Text><Text style={styles.jokerStepText}>If that Upper box is filled, choose an open Lower box. Full House scores 25, Small Straight 30, Large Straight 40, while 3/4 of a Kind and Chance score the dice total.</Text></View>
        <View style={styles.jokerStep}><Text style={styles.jokerStepNumber}>3</Text><Text style={styles.jokerStepText}>If every Lower box is filled, choose an open Upper box and score zero there.</Text></View>
        <View style={styles.jokerBonus}><Ionicons name="add-circle-outline" size={17} color={colors.yellow} /><Text style={styles.jokerBonusText}>Each extra Yahtzee also adds 100 points only if the original Yahtzee box contains 50. If it contains zero, the placement rules still apply but there is no +100.</Text></View>
      </View>}
    </View>

    <Text style={styles.heading}>Account & Leaderboard</Text>
    <View style={styles.accountCard}><Ionicons name="shield-checkmark-outline" size={24} color={colors.cyan} /><Text style={styles.accountCopy}>Use one secure account across mobile and web. Only your username appears publicly; your email and name stay private. Account controls include password management, sign out and permanent deletion.</Text></View>

    <View style={styles.tip}><Ionicons name="bulb-outline" size={22} color={colors.pink} /><Text style={styles.tipText}>Strategy tip: sometimes recording a zero in a weaker category protects a valuable combination or keeps the upper-section bonus within reach.</Text></View>
    <Text style={styles.heading}>Support & Legal</Text>
    <View style={styles.linkCard}>
      {[['Support', 'help-circle-outline', 'support.html'], ['Privacy Policy', 'shield-checkmark-outline', 'privacy.html'], ['Terms of Use', 'document-text-outline', 'terms.html'], ['Account Deletion', 'trash-outline', 'account-deletion.html']].map(([label, icon, page]) => <Pressable key={label} accessibilityRole="link" onPress={() => void Linking.openURL(`https://yahtzee.ijrhservices.co.uk/${page}`)} style={styles.linkRow}><Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={19} color={label === 'Account Deletion' ? colors.danger : colors.cyan} /><Text style={[styles.linkText, label === 'Account Deletion' && { color: colors.danger }]}>{label}</Text><Ionicons name="open-outline" size={16} color={colors.muted} /></Pressable>)}
    </View>
    <View style={styles.footerRow}><Ionicons name="sparkles" size={20} color={colors.pink} /><Text style={styles.footer}>Good luck and happy rolling!</Text></View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  highlightCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.surface, borderColor: '#315057', borderWidth: 1, borderRadius: 14, padding: 15 }, highlightCopy: { flex: 1 }, highlightTitle: { color: colors.yellow, fontSize: 15, fontWeight: '900' }, highlightText: { color: colors.mint, fontSize: 12, lineHeight: 19, marginTop: 5 },
  content: { padding: 20, paddingBottom: 52 }, hero: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, borderColor: '#2d3c40', borderWidth: 1, padding: 14 }, heroIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#173033', alignItems: 'center', justifyContent: 'center' }, heroCopy: { flex: 1 }, heroTitle: { color: colors.yellow, fontWeight: '900', fontSize: 16 }, intro: { color: colors.mint, lineHeight: 19, marginTop: 4, fontSize: 12 }, shareCard: { marginTop: 10, borderColor: colors.yellow, borderWidth: 1, borderRadius: 14, backgroundColor: '#272b13', padding: 14 }, shareCopy: { flex: 1 }, shareTitle: { color: colors.yellow, fontSize: 15, fontWeight: '900' }, shareDescription: { color: colors.mint, fontSize: 11, lineHeight: 17, marginTop: 4 }, qrSection: { alignItems: 'center', marginTop: 14 }, qrFrame: { padding: 10, borderRadius: 12, backgroundColor: colors.white }, qrCopy: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 }, qrTitle: { color: colors.cyan, fontSize: 12, fontWeight: '900' }, qrHint: { color: colors.muted, fontSize: 10, marginTop: 1 }, shareActions: { flexDirection: 'row', gap: 8 }, shareButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12, borderRadius: 11, backgroundColor: colors.yellow }, shareButtonText: { color: colors.background, fontWeight: '900', fontSize: 12 }, qrButton: { borderColor: colors.yellow, borderWidth: 1, backgroundColor: 'transparent' }, qrButtonText: { color: colors.yellow }, heading: { color: colors.pink, fontSize: 21, fontWeight: '900', marginTop: 24, marginBottom: 11 }, modeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }, modeCard: { width: '49%', minHeight: 154, backgroundColor: colors.surface, borderWidth: 1, borderRadius: 12, padding: 12 }, modeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, modeTitle: { fontWeight: '900', marginTop: 8 }, modeDescription: { color: colors.mint, fontSize: 11, lineHeight: 16, marginTop: 4 }, featureList: { gap: 8 }, feature: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: 10, padding: 12 }, featureTitle: { color: colors.white, fontWeight: '900', fontSize: 13 }, featureCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3, paddingRight: 18 }, ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 8 }, ruleNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#34202f', alignItems: 'center', justifyContent: 'center' }, ruleNumberText: { color: colors.pink, fontSize: 11, fontWeight: '900' }, rule: { color: colors.mint, lineHeight: 22, flex: 1 }, scoringCard: { backgroundColor: colors.surface, borderLeftColor: colors.cyan, borderLeftWidth: 3, padding: 12, marginBottom: 7, borderRadius: 8 }, name: { color: colors.yellow, fontWeight: '900' }, description: { color: colors.mint, fontSize: 12, lineHeight: 18, marginTop: 3 }, jokerCard: { overflow: 'hidden', marginTop: 3, borderRadius: 12, borderWidth: 1, borderColor: '#686d19', backgroundColor: '#24270f' }, jokerHeader: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 }, jokerPressed: { opacity: .75 }, jokerIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#343719' }, jokerHeaderCopy: { flex: 1 }, jokerTitle: { color: colors.yellow, fontSize: 13, fontWeight: '900' }, jokerSummary: { color: colors.muted, fontSize: 10.5, lineHeight: 15, marginTop: 2 }, jokerDetails: { gap: 9, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 13, borderTopWidth: 1, borderTopColor: '#4d5117', backgroundColor: '#1c1f0c' }, jokerIntro: { color: colors.mint, fontSize: 11.5, lineHeight: 17, fontWeight: '800' }, jokerStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, jokerStepNumber: { width: 20, height: 20, borderRadius: 10, overflow: 'hidden', color: colors.background, backgroundColor: colors.yellow, fontSize: 10, lineHeight: 20, fontWeight: '900', textAlign: 'center' }, jokerStepText: { flex: 1, color: colors.mint, fontSize: 11, lineHeight: 17 }, jokerBonus: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 9, borderRadius: 9, backgroundColor: '#2a2d14' }, jokerBonusText: { flex: 1, color: colors.yellow, fontSize: 10.5, lineHeight: 16 }, accountCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderColor: '#315a5e', borderWidth: 1, borderRadius: 12, padding: 14 }, accountCopy: { color: colors.mint, fontSize: 12, lineHeight: 19, flex: 1 }, tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderColor: colors.pink, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 20 }, tipText: { color: colors.mint, lineHeight: 20, flex: 1, fontSize: 12 }, linkCard: { backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 12, overflow: 'hidden' }, linkRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderBottomColor: '#263337', borderBottomWidth: 1 }, linkText: { color: colors.mint, fontWeight: '800', flex: 1 }, footerRow: { flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', marginTop: 24 }, footer: { color: colors.pink, fontWeight: '900' },
});
