import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { MasterProfile } from '@/types';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10.5,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  name: { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  headerLine: { fontSize: 11, color: '#444444', marginBottom: 2 },
  contact: { fontSize: 9.5, color: '#666666', marginBottom: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
    paddingBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  paragraph: { fontSize: 10, lineHeight: 1.4, marginBottom: 4 },
  bulletRow: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { width: 10, fontSize: 10 },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.35 },
  skillsLine: { fontSize: 10, lineHeight: 1.5 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  entryTitle: { fontSize: 10.5, fontWeight: 700 },
  entryDates: { fontSize: 9.5, color: '#666666' },
  entrySubtitle: { fontSize: 10, color: '#333333', marginBottom: 3 },
});

interface ResumeDocumentProps {
  masterProfile: MasterProfile;
  tailoredSummary?: string;
  suggestedBullets?: string[];
  targetCompany?: string;
  targetTitle?: string;
}

export const ResumeDocument: React.FC<ResumeDocumentProps> = ({
  masterProfile,
  tailoredSummary,
  suggestedBullets,
  targetCompany,
  targetTitle,
}) => {
  const headerRole = targetTitle
    ? `Tailored for ${targetTitle}${targetCompany ? ` @ ${targetCompany}` : ''}`
    : masterProfile.targetTitle;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{masterProfile.fullName}</Text>
        <Text style={styles.headerLine}>{headerRole}</Text>
        <Text style={styles.contact}>{masterProfile.email}</Text>

        <Text style={styles.sectionTitle}>Summary</Text>
        <Text style={styles.paragraph}>{tailoredSummary || masterProfile.summary}</Text>

        {suggestedBullets && suggestedBullets.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Highlights for This Role</Text>
            {suggestedBullets.map((bullet, i) => (
              <View style={styles.bulletRow} key={`highlight-${i}`}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </>
        )}

        {masterProfile.skills && masterProfile.skills.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Skills</Text>
            <Text style={styles.skillsLine}>{masterProfile.skills.join('  •  ')}</Text>
          </>
        )}

        {masterProfile.experiences && masterProfile.experiences.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Experience</Text>
            {masterProfile.experiences.map((exp) => (
              <View key={exp.id}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>
                    {exp.role} · {exp.company}
                  </Text>
                  <Text style={styles.entryDates}>{exp.dates}</Text>
                </View>
                {exp.achievements?.map((achievement, i) => (
                  <View style={styles.bulletRow} key={`${exp.id}-ach-${i}`}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{achievement}</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        {masterProfile.projects && masterProfile.projects.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Projects</Text>
            {masterProfile.projects.map((project) => (
              <View style={styles.bulletRow} key={project.id}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  {project.name} — {project.description}
                  {project.techStack?.length ? ` (${project.techStack.join(', ')})` : ''}
                </Text>
              </View>
            ))}
          </>
        )}

        {masterProfile.education && masterProfile.education.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Education</Text>
            {masterProfile.education.map((edu) => (
              <Text style={styles.paragraph} key={edu.id}>
                {edu.degree}, {edu.institution} ({edu.year})
              </Text>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
};
