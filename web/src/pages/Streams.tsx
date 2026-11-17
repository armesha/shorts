import Gta6LiveCard from "./Gta6LiveCard";
import StreamReview from "./StreamReview";

export default function Streams() {
  return (
    <div className="route-page space-y-6">
      <StreamReview />
      <Gta6LiveCard />
    </div>
  );
}
