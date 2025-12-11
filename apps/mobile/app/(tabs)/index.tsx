import { StyleSheet, TouchableOpacity, View, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Link, router } from 'expo-router';

export default function HomeScreen() {
  return (
    <ScrollView style={styles.container}>
      <ThemedView style={styles.hero}>
        <ThemedText type="title" style={styles.title}>Fitout Hub</ThemedText>
        <ThemedText style={styles.subtitle}>
          Connect with professionals for your renovation needs
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={() => router.push('/explore')}
        >
          <ThemedText style={styles.buttonText}>Browse Professionals</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => router.push('/modal')}
        >
          <ThemedText style={[styles.buttonText, styles.secondaryButtonText]}>
            Join as Professional
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <ThemedView style={styles.features}>
        <ThemedText type="subtitle" style={styles.featuresTitle}>Why Choose Fitout Hub?</ThemedText>
        
        <View style={styles.featureItem}>
          <ThemedText style={styles.featureEmoji}>🔍</ThemedText>
          <View style={styles.featureContent}>
            <ThemedText type="defaultSemiBold">Find Professionals</ThemedText>
            <ThemedText style={styles.featureDescription}>
              Browse verified contractors, companies, and suppliers
            </ThemedText>
          </View>
        </View>

        <View style={styles.featureItem}>
          <ThemedText style={styles.featureEmoji}>📋</ThemedText>
          <View style={styles.featureContent}>
            <ThemedText type="defaultSemiBold">Manage Projects</ThemedText>
            <ThemedText style={styles.featureDescription}>
              Track your renovation projects from start to finish
            </ThemedText>
          </View>
        </View>

        <View style={styles.featureItem}>
          <ThemedText style={styles.featureEmoji}>⭐</ThemedText>
          <View style={styles.featureContent}>
            <ThemedText type="defaultSemiBold">Verified Reviews</ThemedText>
            <ThemedText style={styles.featureDescription}>
              Read reviews from real clients
            </ThemedText>
          </View>
        </View>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    padding: 24,
    alignItems: 'center',
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  actions: {
    padding: 24,
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#1e293b',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#1e293b',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#1e293b',
  },
  features: {
    padding: 24,
    gap: 20,
  },
  featuresTitle: {
    marginBottom: 8,
  },
  featureItem: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  featureEmoji: {
    fontSize: 32,
  },
  featureContent: {
    flex: 1,
    gap: 4,
  },
  featureDescription: {
    opacity: 0.7,
    fontSize: 14,
  },
});
          <Link.Trigger>
            <ThemedText type="subtitle">Step 2: Explore</ThemedText>
          </Link.Trigger>
          <Link.Preview />
          <Link.Menu>
            <Link.MenuAction title="Action" icon="cube" onPress={() => alert('Action pressed')} />
            <Link.MenuAction
              title="Share"
              icon="square.and.arrow.up"
              onPress={() => alert('Share pressed')}
            />
            <Link.Menu title="More" icon="ellipsis">
              <Link.MenuAction
                title="Delete"
                icon="trash"
                destructive
                onPress={() => alert('Delete pressed')}
              />
            </Link.Menu>
          </Link.Menu>
        </Link>

        <ThemedText>
          {`Tap the Explore tab to learn more about what's included in this starter app.`}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Step 3: Get a fresh start</ThemedText>
        <ThemedText>
          {`When you're ready, run `}
          <ThemedText type="defaultSemiBold">npm run reset-project</ThemedText> to get a fresh{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> directory. This will move the current{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> to{' '}
          <ThemedText type="defaultSemiBold">app-example</ThemedText>.
        </ThemedText>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
