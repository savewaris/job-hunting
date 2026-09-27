import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { MasterProfile } from '@/types/profile';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  header: { marginBottom: 16 },
  name: { fontSize: 20, fontWeight: 700 },
  contact: { fontSize: 10, color: '#555', marginTop: 4 },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 4 },
  bullet: { marginBottom: 2 },
});

interface ResumeDocumentProps {
  profile: MasterProfile;
  tailoredBullets: string;
}

export default function ResumeDocument({ profile, tailoredBullets }: ResumeDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.name}>{profile.fullName}</Text>
          <Text style={styles.contact}>{profile.email} • {profile.phone} • {profile.location}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text>{profile.summary}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tailored Highlights</Text>
          {tailoredBullets.split('\n').filter(Boolean).map((line, i) => (
            <Text key={i} style={styles.bullet}>{line.replace(/^[-*]\s*/, '• ')}</Text>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Experience</Text>
          {profile.experiences.map((exp, i) => (
            <View key={i} style={{ marginBottom: 6 }}>
              <Text style={{ fontWeight: 700 }}>{exp.role} — {exp.company}</Text>
              <Text>{exp.description}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
