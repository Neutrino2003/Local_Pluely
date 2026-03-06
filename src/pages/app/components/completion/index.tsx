import { useCompletion } from "@/hooks";
import { Screenshot } from "./Screenshot";
import { Files } from "./Files";
import { Audio } from "./Audio";
import { Input } from "./Input";

export const Completion = ({
  isHidden,
  systemAudio,
}: {
  isHidden: boolean;
  systemAudio: any;
}) => {
  const completion = useCompletion();

  return (
    <>
      <Audio {...completion} />
      <Input
        {...completion}
        isHidden={isHidden}
        systemAudio={systemAudio}
      />
      <Screenshot {...completion} />
      <Files {...completion} />
    </>
  );
};
