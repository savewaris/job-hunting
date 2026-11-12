import { getMasterProfile } from '@/domain/profile';
import ProfileView from '@/components/profile/ProfileView';

export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  const profile = getMasterProfile();
  return (
    <main className="min-w-0 bg-[#090d16] text-slate-100">
      <ProfileView initialProfile={profile} />
    </main>
  );
}
