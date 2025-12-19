'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera, LogOut } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'

export default function Navbar() {
  const { isAuthenticated, logout, user } = useAuth()
  const router = useRouter()

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center space-x-2">
            <Camera className="w-8 h-8" />
            <span className="text-xl font-bold tracking-tighter">MO GALLERY</span>
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            <Link href="/" className="text-sm font-medium hover:text-primary transition-colors">
              首页
            </Link>
            <Link href="/gallery" className="text-sm font-medium hover:text-primary transition-colors">
              相册
            </Link>
            <Link href="/about" className="text-sm font-medium hover:text-primary transition-colors">
              关于
            </Link>

            {isAuthenticated ? (
              <>
                <Link href="/admin" className="text-sm font-medium hover:text-primary transition-colors">
                  管理
                </Link>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-muted-foreground">{user?.email}</span>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-1 text-sm font-medium hover:text-primary transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>退出</span>
                  </button>
                </div>
              </>
            ) : (
              <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors">
                登录
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  )
}
