import { FrameInfo, Profile, StackListProfileBuilder } from "../lib/profile";

interface JSProfileFrame {
  column: number;
  line: number;
  name: string;
  resourceId: number;
}

interface JSProfileSample {
  timestamp: number;
  stackId: number;
}

interface JSProfileStack {
  frameId: number;
  parentId: number;
}

interface JSProfile {
  frames: JSProfileFrame[];
  resources: string[];
  samples: JSProfileSample[];
  stacks: JSProfileStack[];
}

function makeStack(profile: JSProfile, sample: JSProfileSample): FrameInfo[] {
  if (!sample.stackId) return [];

  const stack = [];
  let currStackNode = profile.stacks[sample.stackId];
  do {
    const frame = profile.frames[currStackNode.frameId];
    const resource = profile.resources[currStackNode.frameId];
    stack.push({
      key: `${resource}:${frame.line}:${frame.column}`,

      // Name of the frame. May be a method name, e.g.
      // "ActiveRecord##to_hash"
      name: frame.name,
    
      // File path of the code corresponding to this
      // call stack frame.
      file: resource,
    
      // Line in the given file where this frame occurs, 1-based.
      line: frame.line,
    
      // Column in the file, 1-based.
      col: frame.column
    });
    currStackNode = profile.stacks[currStackNode.parentId];
  } while (currStackNode);

  return stack.reverse();
}

export function isJSProfile(profile: any): profile is JSProfile {
  return (
    ('frames' in profile) &&
    ('resources' in profile) &&
    ('samples' in profile) &&
    ('stacks' in profile)
  );
}
export function importJsProfiles(profile: JSProfile): Profile {
  const duration = profile.samples[profile.samples.length - 1].timestamp - profile.samples[0].timestamp;
  const profileBuilder = new StackListProfileBuilder(duration);
  let previousEndTime = 0

  profile.samples.forEach((sample, i) => {
    const endTime = sample.timestamp
    const duration = profile.samples[i].timestamp - previousEndTime
    const startTime = endTime - duration
    const idleDurationBefore = startTime - previousEndTime

    // FIXME: 2ms is a lot, but Safari's timestamps and durations don't line up very well and will create
    // phantom idle time
    if (idleDurationBefore > 0.002) {
      profileBuilder.appendSampleWithWeight([], idleDurationBefore)
    }

    profileBuilder.appendSampleWithWeight(makeStack(profile, sample), duration)

    previousEndTime = endTime
  });

  return profileBuilder.build();
}