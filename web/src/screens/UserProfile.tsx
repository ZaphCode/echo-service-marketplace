import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "../api/profiles";
import { BackHeader, ErrorState, Skeletons } from "../components/ui";
import { ProfessionalInfo, ProfileHeader, ReviewList, useProfileData } from "../components/ProfileView";
import type { User } from "../api/models";

export default function UserProfile() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const profile = useQuery({ queryKey: ["profile", id], queryFn: () => getProfile(id) });

  return (
    <div className="page detail">
      <BackHeader onBack={() => navigate(-1)} />
      {profile.isPending ? (
        <Skeletons count={3} />
      ) : profile.isError ? (
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      ) : (
        <Content user={profile.data} />
      )}
    </div>
  );
}

function Content({ user }: { user: User }) {
  const data = useProfileData(user);
  return (
    <>
      <ProfileHeader user={user} data={data} />
      <ProfessionalInfo details={data.details.data} />
      <ReviewList data={data} />
    </>
  );
}
