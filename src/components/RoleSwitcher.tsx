import React from 'react';
import { UserRole } from '../types/leave.ts';

interface RoleSwitcherProps {
  onRoleChange?: (newRole: UserRole) => void;
  /**
   * Role switching in the production UI is strictly disabled.
   * Users must authenticate via login; their authenticated role determines UI and API access.
   */
  isolatedDevTestOnly?: boolean;
}

export function RoleSwitcher(_props: RoleSwitcherProps) {
  return null;
}

