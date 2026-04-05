'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink, Users, Sparkles, Loader2 } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import { getFriendLinks } from '@/lib/api/friends'
import type { FriendLinkDto } from '@/lib/api/types'

export default function TheyPage() {
  const { t } = useLanguage()
  const [friends, setFriends] = useState<FriendLinkDto[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const data = await getFriendLinks()
        setFriends(data)
      } catch (error) {
        console.error('Failed to fetch friend links:', error)
      } finally {
        setLoading(false)
      }
    }

    void fetchFriends()
  }, [])

  return (
    <main className="min-h-screen bg-background">
      <section className="relative flex min-h-[60vh] items-center justify-center overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />

          <motion.div
            className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl"
            animate={{ x: [0, 50, 0], y: [0, -30, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-primary/8 blur-3xl"
            animate={{ x: [0, -40, 0], y: [0, 40, 0], scale: [1, 0.9, 1] }}
            transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          />

          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: `
                linear-gradient(to right, currentColor 1px, transparent 1px),
                linear-gradient(to bottom, currentColor 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <motion.div
              className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            >
              <Users className="h-10 w-10 text-primary" />
            </motion.div>

            <h1 className="mb-6 font-serif text-6xl font-bold tracking-tight md:text-8xl">
              <span className="bg-gradient-to-r from-foreground via-foreground/80 to-foreground bg-clip-text">
                {t('they.title')}
              </span>
            </h1>

            <p className="mb-8 text-lg font-light tracking-wide text-muted-foreground md:text-xl">
              {t('they.subtitle')}
            </p>

            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground/70">
              {t('they.description')}
            </p>
          </motion.div>
        </div>

        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <motion.div
            className="flex h-10 w-6 items-start justify-center rounded-full border-2 border-primary/30 p-2"
            animate={{ y: [0, 5, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <motion.div
              className="h-2 w-1 rounded-full bg-primary/50"
              animate={{ y: [0, 8, 0], opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </motion.div>
        </motion.div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : friends.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-24 text-center"
            >
              <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-muted/50">
                <Users className="h-12 w-12 text-muted-foreground/30" />
              </div>
              <p className="font-serif italic text-muted-foreground">{t('they.empty')}</p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {friends.map((friend, index) => (
                <motion.a
                  key={friend.id}
                  href={friend.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onMouseEnter={() => setHoveredId(friend.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-8 transition-all duration-500 group-hover:border-primary/30 group-hover:shadow-2xl group-hover:shadow-primary/5">
                    {friend.featured ? (
                      <div className="absolute right-4 top-4">
                        <motion.div
                          className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-primary"
                          animate={hoveredId === friend.id ? { scale: [1, 1.1, 1] } : {}}
                          transition={{ duration: 0.5 }}
                        >
                          <Sparkles className="h-3 w-3" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">
                            {t('they.featured')}
                          </span>
                        </motion.div>
                      </div>
                    ) : null}

                    <div className="relative mb-6">
                      <motion.div
                        className="h-20 w-20 overflow-hidden rounded-2xl bg-muted/50 ring-2 ring-border/50 transition-all duration-500 group-hover:ring-primary/30"
                        whileHover={{ scale: 1.05, rotate: 2 }}
                      >
                        {friend.avatar ? (
                          <img
                            src={friend.avatar}
                            alt={friend.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                            <span className="text-2xl font-bold text-primary/60">
                              {friend.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </motion.div>

                      <motion.div
                        className="absolute -inset-2 rounded-3xl border border-primary/0 transition-all duration-500 group-hover:border-primary/20"
                        animate={hoveredId === friend.id ? { rotate: 360 } : { rotate: 0 }}
                        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                      />
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-serif text-xl font-semibold text-foreground transition-colors duration-300 group-hover:text-primary">
                        {friend.name}
                      </h3>

                      {friend.description ? (
                        <p className="line-clamp-2 text-sm text-muted-foreground/70">
                          {friend.description}
                        </p>
                      ) : null}

                      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground/50">
                        <ExternalLink className="h-3 w-3" />
                        <span className="truncate">{new URL(friend.url).hostname}</span>
                      </div>
                    </div>

                    <motion.div
                      className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/0 via-primary to-primary/0"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: hoveredId === friend.id ? 1 : 0 }}
                      transition={{ duration: 0.3 }}
                    />

                    <motion.div
                      className="mt-6 flex items-center justify-between"
                      initial={{ opacity: 0.5 }}
                      animate={{ opacity: hoveredId === friend.id ? 1 : 0.5 }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
                        {t('they.powered_by')}
                      </span>
                      <span className="flex items-center gap-2 text-xs font-medium text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        {t('they.visit')}
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </motion.div>
                  </div>

                  <motion.div
                    className="absolute -inset-4 -z-10 rounded-3xl bg-primary/5 blur-2xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: hoveredId === friend.id ? 1 : 0 }}
                    transition={{ duration: 0.3 }}
                  />
                </motion.a>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-border/50 px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <p className="mb-4 text-sm text-muted-foreground/60">
              {t('they.cta_title')}
            </p>
            <p className="text-xs text-muted-foreground/40">
              {t('they.cta_description')}
            </p>
          </motion.div>
        </div>
      </section>
    </main>
  )
}
