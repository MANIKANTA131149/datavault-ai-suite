import { useEffect, useRef } from "react";
import { useClerk } from "@clerk/react";

interface ClerkUserProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClerkUserProfileModal({ open, onOpenChange }: ClerkUserProfileModalProps) {
  const { openUserProfile } = useClerk();
  const didOpen = useRef(false);

  useEffect(() => {
    if (open && !didOpen.current) {
      didOpen.current = true;
      openUserProfile();
      // Reset so it can be opened again next time
      onOpenChange(false);
    }
    if (!open) {
      didOpen.current = false;
    }
  }, [open, openUserProfile, onOpenChange]);

  return null;
}
