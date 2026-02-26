'use client'

import Link from 'next/link'
import { ArrowRight, Mail, Instagram, Twitter } from 'lucide-react'

export default function About() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center pt-24 md:pt-0">
      <div className="max-w-[1920px] mx-auto px-6 py-24 md:py-12 w-full">
        <div className="flex flex-col md:flex-row gap-16 lg:gap-32 items-stretch">

          {/* Left Column: Image */}
          <div className="w-full md:w-1/2 relative min-h-[50vh] md:min-h-[70vh]">
            <div className="absolute inset-0 bg-secondary overflow-hidden">
              <img
                src="https://r2.mo-gallery.shaio.top/2023/2afb8c3aabd86e361ade492ded3293fa.JPG?auto=format&fit=crop&w=1200&q=80"
                alt="The Artist"
                className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-1000 ease-out"
              />
              <div className="absolute inset-0 border border-border/50 pointer-events-none" />
            </div>

            {/* Overlay Text */}
            <div className="absolute bottom-[-2rem] right-[-1rem] md:right-[-4rem] z-10 bg-background border border-border p-6 md:p-8 max-w-xs">
              <p className="font-serif text-3xl italic">
                "光是唯一的真实。"
              </p>
            </div>
          </div>

          {/* Right Column: Text */}
          <div className="w-full md:w-1/2 flex flex-col justify-center">
            <div className="mb-12">
              <span className="block font-sans text-xs font-bold tracking-[0.2em] text-primary mb-4 uppercase">
                简介
              </span>
              <h1 className="font-serif text-6xl md:text-8xl font-light tracking-tighter leading-none mb-8">
                MO<br />画廊
              </h1>
            </div>

            <div className="prose prose-lg prose-invert text-muted-foreground font-serif leading-relaxed space-y-6">
              <p>
                <span className="text-foreground text-5xl float-left mr-3 mt-[-10px] font-serif">你</span>
                好，我是 SHAI。2023 年开始接触摄影，钟爱人文、人像、与风光。喜欢一切美好的事物，用快门定格转瞬即逝的瞬间，让照片成为永恒。
              </p>
              <p>
                我也试着用文字为每张照片注入温度，尽我所能让它们更加鲜活。
              </p>
            </div>

            <div className="mt-16 border-t border-border pt-8">
              <h3 className="font-sans text-xs font-bold tracking-[0.2em] text-primary mb-8 uppercase">
                联系与咨询
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <a href="mailto:hi@mogallery.com" className="flex items-center gap-4 group">
                    <div className="p-3 border border-border group-hover:bg-primary group-hover:text-background transition-colors">
                      <Mail className="w-4 h-4" />
                    </div>
                    <span className="font-sans text-sm tracking-widest uppercase text-muted-foreground group-hover:text-foreground transition-colors">
                      hi@mogallery.com
                    </span>
                  </a>
                </div>

                <div className="flex gap-4">
                  <a href="#" className="p-3 border border-border hover:bg-primary hover:text-background transition-colors">
                    <Instagram className="w-4 h-4" />
                  </a>
                  <a href="#" className="p-3 border border-border hover:bg-primary hover:text-background transition-colors">
                    <Twitter className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-12">
              <Link href="/gallery" className="inline-flex items-center gap-2 font-sans text-xs font-bold tracking-[0.2em] uppercase hover:text-primary transition-colors group">
                查看作品集 <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
