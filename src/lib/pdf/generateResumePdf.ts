import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import ResumeDocument from './ResumeDocument';
import { MasterProfile } from '@/types/profile';

export async function generateResumePdf(profile: MasterProfile, tailoredBullets: string): Promise<Buffer> {
  // @react-pdf/renderer types renderToBuffer's parameter as ReactElement<DocumentProps>
  // specifically (the <Document> element itself), not a custom wrapper component that
  // renders one — even though that's the library's own documented usage pattern. The
  // cast below is a type-only workaround for that overly narrow upstream signature.
  const element = React.createElement(ResumeDocument, { profile, tailoredBullets }) as unknown as Parameters<
    typeof renderToBuffer
  >[0];
  return renderToBuffer(element);
}
