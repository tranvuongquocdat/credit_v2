'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Star } from 'lucide-react';

export default function SkillsPage() {
  const router = useRouter();

  const skillCategories = [
    {
      title: "Frontend Development",
      skills: [
        { name: "React/Next.js", level: 95, color: "bg-blue-500" },
        { name: "TypeScript", level: 90, color: "bg-blue-600" },
        { name: "Tailwind CSS", level: 88, color: "bg-cyan-500" },
        { name: "Vue.js", level: 75, color: "bg-green-500" },
      ]
    },
    {
      title: "Backend Development", 
      skills: [
        { name: "Node.js", level: 92, color: "bg-green-600" },
        { name: "Python", level: 85, color: "bg-yellow-500" },
        { name: "PostgreSQL", level: 80, color: "bg-blue-700" },
        { name: "MongoDB", level: 75, color: "bg-green-700" },
      ]
    },
    {
      title: "Tools & Technologies",
      skills: [
        { name: "Git/GitHub", level: 95, color: "bg-gray-700" },
        { name: "Docker", level: 80, color: "bg-blue-400" },
        { name: "AWS", level: 75, color: "bg-orange-500" },
        { name: "Figma", level: 70, color: "bg-purple-500" },
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
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
            My Skills
          </div>
          <div className="w-24"></div> {/* Spacer for centering */}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-6">
            Technical
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-blue-600">
              {" "}Expertise
            </span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            Over the years, I've developed proficiency in a wide range of technologies 
            and tools that help me build robust, scalable, and user-friendly applications.
          </p>
        </div>
      </section>

      {/* Skills Grid */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8">
            {skillCategories.map((category, categoryIndex) => (
              <div key={categoryIndex} className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-6 text-center">
                  {category.title}
                </h3>
                <div className="space-y-4">
                  {category.skills.map((skill, skillIndex) => (
                    <div key={skillIndex}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-700 font-medium">{skill.name}</span>
                        <span className="text-gray-500 text-sm">{skill.level}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`${skill.color} h-2 rounded-full transition-all duration-1000 ease-out`}
                          style={{ width: `${skill.level}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Certifications Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-800 mb-12 text-center">Certifications & Achievements</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Star className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">AWS Certified Developer</h3>
                  <p className="text-gray-600">Amazon Web Services</p>
                </div>
              </div>
              <p className="text-gray-600">
                Certified in designing and developing applications on AWS platform with 
                best practices for security, scalability, and performance.
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <Star className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">React Advanced Certification</h3>
                  <p className="text-gray-600">Meta (Facebook)</p>
                </div>
              </div>
              <p className="text-gray-600">
                Advanced certification covering React ecosystem, performance optimization, 
                and modern development patterns.
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <Star className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Google Cloud Professional</h3>
                  <p className="text-gray-600">Google Cloud Platform</p>
                </div>
              </div>
              <p className="text-gray-600">
                Professional level certification in cloud architecture and 
                application development on Google Cloud Platform.
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <Star className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Scrum Master Certified</h3>
                  <p className="text-gray-600">Scrum Alliance</p>
                </div>
              </div>
              <p className="text-gray-600">
                Certified Scrum Master with expertise in agile methodologies 
                and team leadership in software development.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Learning Philosophy */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-800 mb-8">My Learning Philosophy</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl">
                📚
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Continuous Learning</h3>
              <p className="text-gray-600">
                Technology evolves rapidly. I dedicate time weekly to learning new tools and techniques.
              </p>
            </div>
            
            <div className="p-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center text-white text-2xl">
                🛠️
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Hands-On Practice</h3>
              <p className="text-gray-600">
                I believe in learning by doing. Every new skill is applied in real projects.
              </p>
            </div>
            
            <div className="p-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-2xl">
                🤝
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Knowledge Sharing</h3>
              <p className="text-gray-600">
                Teaching others reinforces my own learning and helps build stronger teams.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-20 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-6">
            Ready to see these skills in action?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Check out my projects to see how I apply these technologies to solve real problems.
          </p>
          <Button 
            onClick={() => router.push('/portfolio/projects')}
            className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white px-8 py-3 text-lg"
          >
            View My Projects
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>
    </div>
  );
} 