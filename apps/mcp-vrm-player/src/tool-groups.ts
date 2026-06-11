/**
 * Built-in tool group definitions for batch enable/disable via --disable-groups.
 *
 * Groups map logical feature names to the list of tool names they contain.
 * Tool names are unprefixed (the tts_ prefix is handled by registration).
 */
export const TOOL_GROUPS: Record<string, string[]> = {
  /** All player UI tools */
  player: ['start_here', 'speak_player', 'find_models', 'open_model_manager', 'list_vrms', 'set_default_model'],
  /**
   * Dictionary tools were removed from this server; the group name is kept so
   * existing --disable-groups dictionary configurations don't start erroring.
   */
  dictionary: [],
  /**
   * File synthesis tools were removed from this server; the group name is kept so
   * existing --disable-groups file configurations don't start erroring.
   */
  file: [],
  /** MCP App tools (tools registered as UI apps, i.e. with registerAppTool) */
  apps: [
    'speak_player',
    'open_model_manager',
    '_get_speakers_for_player',
    '_get_speaker_icon_for_player',
    '_test_speak_for_player',
    '_resynthesize_for_player',
    '_get_player_audio_for_player',
    '_get_player_settings_for_player',
    '_set_player_settings_for_player',
    '_list_vrms_for_player',
    '_get_vrm_for_player',
    '_register_vrm_for_player',
    '_update_vrm_for_player',
    '_replace_vrm_binary_for_player',
    '_delete_vrm_for_player',
    '_resolve_default_vrm_for_player',
    '_list_poses_for_player',
    '_get_pose_for_player',
    '_register_pose_for_player',
    '_update_pose_for_player',
    '_delete_pose_for_player',
  ],
}

/**
 * Expand a list of group names into individual tool names.
 * Unknown group names are logged and skipped.
 */
export function expandGroups(groupNames: string[]): string[] {
  const tools: string[] = []
  for (const name of groupNames) {
    const members = TOOL_GROUPS[name]
    if (members) {
      tools.push(...members)
    } else {
      console.error(`[mcp-vrm] Unknown tool group: "${name}". Valid groups: ${Object.keys(TOOL_GROUPS).join(', ')}`)
    }
  }
  return tools
}
