"use client";

import { useEffect, useState } from "react";

export function LogoSplash({ children }: { children: React.ReactNode }) {
    const [showContent, setShowContent] = useState(false);
    const [isAnimating, setIsAnimating] = useState(true);

    useEffect(() => {
        // Stage 1: Display Logo
        // Stage 2: Start opening shutters after logo has been visible
        const timer = setTimeout(() => {
            setShowContent(true);
        }, 1500);

        // Stage 3: Remove splash overlay completely after animation
        const completeTimer = setTimeout(() => {
            setIsAnimating(false);
        }, 4000);

        return () => {
            clearTimeout(timer);
            clearTimeout(completeTimer);
        };
    }, []);

    if (!isAnimating) return <>{children}</>;

    return (
        <div className="relative min-h-screen">
            {/* Background Content (revealed) */}
            <div className={showContent ? "animate-content-fade-in" : "opacity-0"}>
                {children}
            </div>

            {/* Splash Overlay */}
            <div className="fixed inset-0 z-[100] flex pointer-events-none overflow-hidden">
                {/* Left Shutter */}
                <div
                    className={`h-full w-1/2 bg-[#040711] border-r border-white/5 ${showContent ? "animate-shutter-left" : ""
                        }`}
                />

                {/* Right Shutter */}
                <div
                    className={`h-full w-1/2 bg-[#040711] border-l border-white/5 ${showContent ? "animate-shutter-right" : ""
                        }`}
                />

                {/* Centered Logo */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[110]">
                    <div className="animate-logo-reveal text-6xl font-black tracking-tighter text-primary">
                        kemo
                    </div>
                </div>
            </div>
        </div>
    );
}
