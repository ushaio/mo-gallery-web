'use client'

import { useState } from 'react'
import { Upload, Image as ImageIcon, Settings, LogOut, Plus } from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

function AdminDashboard() {
  const { logout } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('photos')

  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-background hidden md:block">
        <div className="p-6">
          <h2 className="text-lg font-bold">管理后台</h2>
        </div>
        <nav className="px-4 space-y-2">
          <button 
            onClick={() => setActiveTab('photos')}
            className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg text-sm transition-colors ${activeTab === 'photos' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>照片管理</span>
          </button>
          <button 
            onClick={() => setActiveTab('upload')}
            className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg text-sm transition-colors ${activeTab === 'upload' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            <Upload className="w-4 h-4" />
            <span>上传照片</span>
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg text-sm transition-colors ${activeTab === 'settings' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            <Settings className="w-4 h-4" />
            <span>系统配置</span>
          </button>
        </nav>
        <div className="absolute bottom-8 px-4 w-64">
          <button
            onClick={() => {
              logout()
              router.push('/')
            }}
            className="w-full flex items-center space-x-3 px-4 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold">
              {activeTab === 'photos' && '照片管理'}
              {activeTab === 'upload' && '上传照片'}
              {activeTab === 'settings' && '系统配置'}
            </h1>
            {activeTab === 'photos' && (
              <button 
                onClick={() => setActiveTab('upload')}
                className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
              >
                <Plus className="w-4 h-4 mr-2" />
                新增照片
              </button>
            )}
          </div>

          {activeTab === 'photos' && (
            <div className="bg-background rounded-xl border p-6">
              <div className="grid grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="aspect-square rounded-lg bg-muted relative group">
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/50 transition-opacity rounded-lg">
                      <button className="p-2 bg-white text-black rounded-full mx-1">编辑</button>
                      <button className="p-2 bg-red-500 text-white rounded-full mx-1">删除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="bg-background rounded-xl border p-12 text-center border-dashed border-2">
              <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">点击或拖拽上传照片</h3>
              <p className="text-sm text-muted-foreground mb-6">支持 JPG, PNG, WEBP 格式 (最大 10MB)</p>
              <button className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
                选择文件
              </button>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-background rounded-xl border p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">存储提供商</label>
                <select className="w-full p-2 border rounded-lg bg-background">
                  <option>Cloudflare R2</option>
                  <option>Tencent Cloud COS</option>
                  <option>GitHub</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">CDN 域名</label>
                <input type="text" placeholder="cdn.example.com" className="w-full p-2 border rounded-lg bg-background" />
              </div>
              <button className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
                保存配置
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function AdminPage() {
  return (
    <ProtectedRoute>
      <AdminDashboard />
    </ProtectedRoute>
  )
}
