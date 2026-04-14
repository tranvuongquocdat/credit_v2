'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink, Github, Eye, Code2 } from 'lucide-react';

export default function ProjectsPage() {
  const router = useRouter();

  const projects = [
    {
      id: 1,
      title: "E-Commerce Platform",
      description: "A full-stack e-commerce solution built with Next.js, TypeScript, and PostgreSQL. Features include real-time inventory, payment processing, and admin dashboard.",
      image: "🛒",
      technologies: ["Next.js", "TypeScript", "PostgreSQL", "Stripe"],
      liveUrl: "#",
      githubUrl: "#",
      featured: true
    },
    {
      id: 2,
      title: "Task Management App",
      description: "A collaborative project management tool with real-time updates, drag-and-drop functionality, and team collaboration features.",
      image: "📋",
      technologies: ["React", "Node.js", "Socket.io", "MongoDB"],
      liveUrl: "#",
      githubUrl: "#",
      featured: true
    },
    {
      id: 3,
      title: "Weather Analytics Dashboard",
      description: "A data visualization dashboard that displays weather patterns and forecasts using third-party APIs and interactive charts.",
      image: "🌤️",
      technologies: ["Vue.js", "Python", "D3.js", "FastAPI"],
      liveUrl: "#",
      githubUrl: "#",
      featured: false
    },
    {
      id: 4,
      title: "Social Media Scheduler",
      description: "An automation tool for scheduling and managing social media posts across multiple platforms with analytics tracking.",
      image: "📱",
      technologies: ["React", "Express", "Redis", "AWS"],
      liveUrl: "#",
      githubUrl: "#",
      featured: false
    },
    {
      id: 5,
      title: "Learning Management System",
      description: "A comprehensive LMS with course creation, student progress tracking, and interactive learning modules.",
      image: "🎓",
      technologies: ["Next.js", "Prisma", "tRPC", "Tailwind"],
      liveUrl: "#",
      githubUrl: "#",
      featured: false
    },
    {
      id: 6,
      title: "Financial Dashboard",
      description: "A real-time financial tracking application with expense categorization, budget planning, and investment portfolio management.",
      image: "💰",
      technologies: ["React", "TypeScript", "Chart.js", "Node.js"],
      liveUrl: "#",
      githubUrl: "#",
      featured: false
    }
  ];

  const featuredProjects = projects.filter(project => project.featured);
  const otherProjects = projects.filter(project => !project.featured);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
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
            My Projects
          </div>
          <div className="w-24"></div> {/* Spacer for centering */}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-6">
            Featured
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-600">
              {" "}Projects
            </span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            A showcase of my recent work, featuring full-stack applications, 
            innovative solutions, and creative problem-solving approaches.
          </p>
        </div>
      </section>

      {/* Featured Projects */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-800 mb-12 text-center">Featured Work</h2>
          <div className="grid lg:grid-cols-2 gap-8">
            {featuredProjects.map((project) => (
              <div key={project.id} className="bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow overflow-hidden">
                <div className="p-8">
                  <div className="text-6xl mb-4 text-center">{project.image}</div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-3">{project.title}</h3>
                  <p className="text-gray-600 mb-4 leading-relaxed">{project.description}</p>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {project.technologies.map((tech, index) => (
                      <span 
                        key={index}
                        className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Live Demo
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Github className="h-4 w-4" />
                      Source Code
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Other Projects */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-800 mb-12 text-center">More Projects</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {otherProjects.map((project) => (
              <div key={project.id} className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
                <div className="text-4xl mb-3 text-center">{project.image}</div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">{project.title}</h3>
                <p className="text-gray-600 text-sm mb-3 leading-relaxed">{project.description}</p>
                <div className="flex flex-wrap gap-1 mb-4">
                  {project.technologies.slice(0, 3).map((tech, index) => (
                    <span 
                      key={index}
                      className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Demo
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Code2 className="h-3 w-3 mr-1" />
                    Code
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Development Process */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-800 mb-12 text-center">My Development Process</h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center p-6">
              <button 
                onClick={() => router.push('/login')}
                className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-2xl hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 cursor-pointer"
              >
                1
              </button>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Research & Planning</h3>
              <p className="text-gray-600 text-sm">Understanding requirements and planning the architecture</p>
            </div>
            
            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl">
                2
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Design & Prototype</h3>
              <p className="text-gray-600 text-sm">Creating wireframes and interactive prototypes</p>
            </div>
            
            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white text-2xl">
                3
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Development</h3>
              <p className="text-gray-600 text-sm">Building with clean, scalable, and tested code</p>
            </div>
            
            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-pink-500 to-red-600 rounded-full flex items-center justify-center text-white text-2xl">
                4
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Deploy & Optimize</h3>
              <p className="text-gray-600 text-sm">Launching and continuously improving performance</p>
            </div>
          </div>
        </div>
      </section>

      {/* Collaboration Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-800 mb-8">Want to Collaborate?</h2>
          <p className="text-xl text-gray-600 mb-8">
            I'm always excited to work on new projects and challenges. 
            Let's create something amazing together!
          </p>
          <Button className="bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700 text-white px-8 py-3 text-lg">
            Get In Touch
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
        <div className="container mx-auto px-6 text-center">
          <p className="text-gray-400">
            © 2024 Alex Johnson. Built with passion and Next.js.
          </p>
        </div>
      </footer>
    </div>
  );
} 