import { isToolEnabled } from './guidance-refs.js'
import { BUILTIN_POSE_IDS } from './pose-registry/types.js'

export const EMOTION_GUIDE = 'neutral, happy, angry, sad, relaxed, surprised, serious'

export const DEFAULT_POSE_NAMES = [...BUILTIN_POSE_IDS]

export const MCP_APPS_UNAVAILABLE_GUIDE =
  'The player and model manager require an MCP client that can display MCP Apps UI. If the UI did not open, use an MCP Apps-compatible client and reconnect this server.'

const REGISTRATION_GUIDE_STEPS = [
  'No VRM model is registered yet. Explain this setup to the user:',
  '1. Get a .vrm model file from a VRM-compatible creator/exporter or a distribution site where the license allows local use.',
  '2. Open the model manager UI, drop or select the .vrm file, choose the TTS speaker, and save it.',
  '3. Mark the model as the default if they want future speak_player calls to use it automatically.',
  '4. Optional VRMA poses can be added in pose management, then assigned to model pose names in the model edit screen.',
]

// References the open_model_manager tool by name, so it is only useful when that tool is enabled.
const REGISTRATION_GUIDE_MANAGER_TIP =
  '5. Next time, pass knowsHowToUse: true to open_model_manager if the user already knows these steps.'

export const REGISTRATION_GUIDE_SHORT =
  'The model manager UI was opened. Register or edit a VRM model there. Detailed setup instructions are omitted because knowsHowToUse was true.'

export function getRegistrationGuide(disabledTools: Set<string>, knowsHowToUse?: boolean): string {
  if (knowsHowToUse) return REGISTRATION_GUIDE_SHORT
  const steps = [...REGISTRATION_GUIDE_STEPS]
  // Drop the open_model_manager-specific tip when the tool is disabled, so the
  // guide does not point users at a tool that is absent from tools/list.
  if (isToolEnabled(disabledTools, 'open_model_manager')) {
    steps.push(REGISTRATION_GUIDE_MANAGER_TIP)
  }
  return steps.join('\n')
}
