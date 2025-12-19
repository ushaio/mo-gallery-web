export default function About() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-24 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row gap-12 items-center">
        <div className="w-full md:w-1/2 aspect-[3/4] rounded-2xl overflow-hidden bg-muted">
          <img 
            src="https://images.unsplash.com/photo-1554080353-a576cf803bda?auto=format&fit=crop&w=800&q=80" 
            alt="Photographer" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="w-full md:w-1/2">
          <h1 className="text-4xl font-bold mb-6">关于我</h1>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            你好，我是 MO。一名热爱捕捉生活瞬间的独立摄影师。
          </p>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            我的摄影之旅始于十年前的一次远足，当时我被大自然的壮丽所震撼，萌生了记录这一切的想法。
            自那以后，相机成了我观察世界的另一只眼睛。
          </p>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            我擅长自然风光与街头人文摄影。对我而言，摄影不仅仅是按下快门，
            更是在那一刻与被摄者或景物达成的情感共鸣。
          </p>
          
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">联系我</h3>
            <p className="text-muted-foreground text-sm">Email: hi@mogallery.com</p>
            <p className="text-muted-foreground text-sm">Instagram: @mo_photography</p>
          </div>
        </div>
      </div>
    </div>
  )
}
