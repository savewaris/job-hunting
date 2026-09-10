import { renderToBuffer } from '@react-pdf/renderer';
import { ResumeDocument } from './ResumeDocument';
import { MasterProfile } from '@/types';

interface GenerateResumePdfOptions {
  masterProfile: MasterProfile;
  tailoredSummary?: string;
  suggestedBullets?: string[];
  targetCompany?: string;
  targetTitle?: string;
}

export async function generateResumePdfBuffer(options: GenerateResumePdfOptions): Promise<Buffer> {
  return renderToBuffer(<ResumeDocument {...options} />);
}
