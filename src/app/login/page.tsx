"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, Eye, EyeOff, ShieldAlert, ArrowRight } from 'lucide-react';
import { apiUrl } from '@/lib/apiBase';
import { APP_BASE_PATH } from '@/lib/basePath';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !password) {
            setError('Por favor complete todos los campos');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(apiUrl('/api/auth/login'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Credenciales incorrectas');
            }

            // Redirect to home page upon success
            router.push('/');
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Ocurrió un error al intentar iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen flex items-center justify-center bg-[#0B1329] overflow-hidden font-sans">
            {/* Background design elements */}
            <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-br from-[#1E293B] to-[#526928]/10 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-gradient-to-tl from-[#526928]/20 to-[#96C156]/5 blur-[100px] pointer-events-none" />

            <div className="w-full max-w-md p-8 m-4 relative z-10">
                {/* Brand Logo & Header */}
                <div className="text-center mb-8 flex flex-col items-center justify-center">
                    <img
                        src={`${APP_BASE_PATH}/Logo_desarrollo_social_2.png`}
                        alt="Desarrollo Social"
                        className="h-20 w-auto mb-4 object-contain"
                    />
                    <p className="text-[#94A3B8] text-sm mt-2 font-medium">Tablero de Control - Desarrollo Social</p>
                </div>

                {/* Main Card Container */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[32px] shadow-2xl space-y-6">
                    <div className="space-y-1">
                        <h2 className="text-xl font-bold text-white text-center">Iniciar Sesión</h2>
                    </div>

                    {error && (
                        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-2xl text-xs font-bold leading-relaxed animate-shake">
                            <ShieldAlert size={18} className="text-red-400 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Username Input */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase tracking-widest text-[#94A3B8]" htmlFor="username">
                                Usuario
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400">
                                    <User size={18} />
                                </span>
                                <input
                                    id="username"
                                    type="text"
                                    placeholder="Nombre de usuario"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-slate-500 text-sm font-semibold transition-all focus:outline-none focus:border-[#96C156] focus:ring-1 focus:ring-[#96C156]/50"
                                    required
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Password Input */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase tracking-widest text-[#94A3B8]" htmlFor="password">
                                Contraseña
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400">
                                    <Lock size={18} />
                                </span>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-11 pr-12 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-slate-500 text-sm font-semibold transition-all focus:outline-none focus:border-[#96C156] focus:ring-1 focus:ring-[#96C156]/50"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-white transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-gradient-to-r from-[#526928] to-[#96C156] text-white rounded-2xl font-black text-sm uppercase tracking-wider transition-all duration-300 hover:shadow-xl hover:shadow-[#526928]/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 mt-2"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span>Ingresar</span>
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer copyright */}
                <div className="text-center mt-8">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        © 2026 Instituto de Modernización e Innovación - Corrientes
                    </p>
                </div>
            </div>
        </div>
    );
}
