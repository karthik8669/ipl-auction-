"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import Image from "next/image";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gold"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
    } catch {
      // Handle error
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Top-right user menu */}
      <div className="absolute top-4 right-4 z-50">
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-2">
          {user.photoURL ? (
            <Image
              src={user.photoURL}
              alt={user.displayName || "Avatar"}
              width={32}
              height={32}
              className="rounded-full"
              priority={true}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white">
              <User className="w-4 h-4" />
            </div>
          )}
          <span className="text-sm font-medium text-white hidden sm:block">
            {user.displayName || "Guest"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="text-muted hover:text-white"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {children}
    </div>
  );
}
