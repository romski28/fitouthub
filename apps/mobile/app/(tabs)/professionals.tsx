import { useState, useEffect } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { api, Professional } from '@/services/api';

export default function ExploreScreen() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfessionals();
  }, []);

  const loadProfessionals = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getProfessionals();
      setProfessionals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load professionals');
    } finally {
      setLoading(false);
    }
  };

  const renderProfessional = ({ item }: { item: Professional }) => (
    <TouchableOpacity style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="defaultSemiBold" style={styles.name}>
          {item.fullName || item.businessName || 'Professional'}
        </ThemedText>
        <View style={styles.badge}>
          <ThemedText style={styles.badgeText}>{item.professionType}</ThemedText>
        </View>
      </View>
      
      {item.serviceArea && (
        <ThemedText style={styles.detail}>📍 {item.serviceArea}</ThemedText>
      )}
      
      <View style={styles.footer}>
        <ThemedText style={styles.detail}>⭐ {item.rating.toFixed(1)}</ThemedText>
        <ThemedText style={[styles.status, item.status === 'approved' && styles.statusApproved]}>
          {item.status}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color="#1e293b" />
        <ThemedText style={styles.loadingText}>Loading professionals...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText style={styles.errorText}>❌ {error}</ThemedText>
        <TouchableOpacity style={styles.retryButton} onPress={loadProfessionals}>
          <ThemedText style={styles.retryText}>Retry</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Professionals</ThemedText>
        <ThemedText style={styles.count}>{professionals.length} found</ThemedText>
      </View>

      <FlatList
        data={professionals}
        renderItem={renderProfessional}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <ThemedView style={styles.empty}>
            <ThemedText style={styles.emptyText}>No professionals found</ThemedText>
          </ThemedView>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  count: {
    opacity: 0.6,
    marginTop: 4,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    flex: 1,
    fontSize: 16,
  },
  badge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  detail: {
    opacity: 0.7,
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  status: {
    fontSize: 12,
    textTransform: 'capitalize',
    opacity: 0.6,
  },
  statusApproved: {
    color: '#16a34a',
    opacity: 1,
  },
  loadingText: {
    opacity: 0.6,
  },
  errorText: {
    color: '#dc2626',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  empty: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    opacity: 0.5,
  },
});
