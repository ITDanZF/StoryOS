import storyLogoUrl from "../../assets/storyos-logo.svg";
import { cn } from "../../../lib/utils.ts";

type StoryLogoProps = {
  readonly className?: string;
  readonly imageClassName?: string;
};

export default function StoryLogo({ className, imageClassName }: StoryLogoProps) {
  return (
    <span className={cn("inline-grid shrink-0 place-items-center overflow-hidden", className)} aria-hidden="true">
      <img className={cn("block size-full", imageClassName)} src={storyLogoUrl} alt="" />
    </span>
  );
}
