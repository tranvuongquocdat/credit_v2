'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Download, MapPin, Calendar, Mail } from 'lucide-react';

export default function AboutPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Header */}
      <header className="container mx-auto px-6 py-8">
        <nav className="flex justify-between items-center">
          <Button 
            variant="outline" 
            onClick={() => router.push('/')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
          <div className="text-2xl font-bold text-gray-800">
            About Me
          </div>
          <div className="w-24"></div> {/* Spacer for centering */}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-6">
                Hi, I'm 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">
                  {" "}Alex Johnson
                </span>
              </h1>
              <p className="text-xl text-gray-600 mb-6 leading-relaxed">
                A passionate full-stack developer with 5+ years of experience creating 
                digital experiences that combine beautiful design with robust functionality. 
                I love turning complex problems into simple, elegant solutions.
              </p>
              <div className="flex flex-wrap gap-4 mb-8">
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin className="h-5 w-5 text-purple-600" />
                  San Francisco, CA
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  5+ Years Experience
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="h-5 w-5 text-green-600" />
                  alex@example.com
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  onClick={() => router.push('/portfolio/projects')}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3"
                >
                  View My Projects
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button 
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50 px-6 py-3"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download CV
                </Button>
              </div>
            </div>
            
            <div className="relative">
              <div className="w-80 h-80 mx-auto bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center text-white text-6xl font-bold shadow-2xl">
                AJ
              </div>
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-yellow-400 rounded-full flex items-center justify-center text-2xl">
                👋
              </div>
              <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-green-400 rounded-full flex items-center justify-center text-xl">
                💻
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Journey Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-800 mb-12 text-center">My Journey</h2>
          <div className="space-y-8">
            <div className="flex gap-6 p-6 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-bold">2019</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Started My Development Journey</h3>
                <p className="text-gray-600">
                  Began learning programming with JavaScript and Python. Built my first web application 
                  and fell in love with the endless possibilities of code.
                </p>
              </div>
            </div>
            
            <div className="flex gap-6 p-6 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-purple-600 font-bold">2021</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">First Professional Role</h3>
                <p className="text-gray-600">
                  Joined TechCorp as a Junior Developer. Worked on large-scale applications 
                  and learned the importance of clean, maintainable code.
                </p>
              </div>
            </div>
            
            <div className="flex gap-6 p-6 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-green-600 font-bold">2024</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Senior Developer & Mentor</h3>
                <p className="text-gray-600">
                  Now leading development teams and mentoring junior developers. 
                  Passionate about sharing knowledge and building amazing products.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-800 mb-12 text-center">What Drives Me</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl">
                🎯
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Purpose-Driven</h3>
              <p className="text-gray-600">
                I believe technology should solve real problems and make people's lives better.
              </p>
            </div>
            
            <div className="text-center p-6">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center text-white text-2xl">
                🌱
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Continuous Learning</h3>
              <p className="text-gray-600">
                The tech world evolves rapidly, and I'm committed to growing with it every day.
              </p>
            </div>
            
            <div className="text-center p-6">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-2xl">
                🤝
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Collaboration</h3>
              <p className="text-gray-600">
                Great products are built by great teams. I value open communication and shared success.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-20 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-6">
            Want to know more about my work?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Check out my projects and see what I've been building lately.
          </p>
          <Button 
            onClick={() => router.push('/portfolio/projects')}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-3 text-lg"
          >
            Explore My Projects
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>
    </div>
  );
} 