'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowRight, BookOpen, Users, Brain, Shield, Zap } from 'lucide-react'

export default function Home() {
  const [isScrolled, setIsScrolled] = useState(false)

  useState(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/5">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-sm border-b border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl text-foreground">Rehearsals</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition">
              How It Works
            </a>
            <a href="#about" className="text-sm text-muted-foreground hover:text-foreground transition">
              About
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6 px-3 py-1 rounded-full bg-accent/10 border border-accent/20">
            <span className="text-sm font-medium text-accent">For CS Students at TMU</span>
          </div>
          
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-foreground mb-6 text-balance">
            Learn Through Experience
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 text-balance max-w-2xl mx-auto">
            Rehearsals immerses you in realistic scenarios where intelligent coaching agents guide your learning journey, helping you develop ethical decision-making skills and reflective thinking.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button 
              size="lg" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl px-8 py-6 text-lg group"
            >
              Access Platform
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="border border-border text-foreground hover:bg-secondary/50 font-semibold rounded-xl px-8 py-6 text-lg"
            >
              Explore Features
            </Button>
          </div>

          {/* Hero Image Placeholder */}
          <div className="relative rounded-2xl overflow-hidden border border-border/40 shadow-2xl bg-secondary/20 h-96 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent" />
            <div className="relative z-10 text-center">
              <Brain className="w-24 h-24 text-primary/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Interactive Learning Scenarios</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-border/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">Why Rehearsals?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A comprehensive learning experience designed specifically for your growth
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: 'Intelligent Coaching',
                description: 'Affective coaching agents adapt to your learning pace and provide personalized guidance'
              },
              {
                icon: Shield,
                title: 'Ethical Decision-Making',
                description: 'Navigate complex scenarios that challenge you to think critically about ethics and impact'
              },
              {
                icon: Users,
                title: 'Reflective Learning',
                description: 'Engage in thoughtful reflection to deepen your understanding and improve decision-making'
              },
              {
                icon: Zap,
                title: 'Immersive Scenarios',
                description: 'Experience realistic vignettes that mirror real-world challenges you\'ll encounter'
              },
              {
                icon: BookOpen,
                title: 'Progress Tracking',
                description: 'Monitor your growth and identify areas for continued development'
              },
              {
                icon: ArrowRight,
                title: 'Seamless Integration',
                description: 'Designed to complement your academic journey with practical, applicable learning'
              }
            ].map((feature, idx) => (
              <Card 
                key={idx}
                className="p-6 border border-border/40 bg-card hover:bg-card/80 hover:border-accent/20 transition-all cursor-pointer group"
              >
                <feature.icon className="w-8 h-8 text-primary mb-4 group-hover:text-accent transition-colors" />
                <h3 className="font-semibold text-lg text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">Your Learning Journey</h2>
            <p className="text-lg text-muted-foreground">From login to mastery in four key steps</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                step: '1',
                title: 'Login & Setup',
                description: 'Access your personalized learning environment'
              },
              {
                step: '2',
                title: 'Select Scenario',
                description: 'Choose from curated scenarios aligned with your learning goals'
              },
              {
                step: '3',
                title: 'Engage & Learn',
                description: 'Navigate scenarios with real-time coaching guidance'
              },
              {
                step: '4',
                title: 'Reflect & Improve',
                description: 'Review insights and track your progress'
              }
            ].map((item, idx) => (
              <div key={idx} className="relative">
                <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl p-8 border border-border/40 h-full flex flex-col">
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold mb-4">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-lg text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                {idx < 3 && (
                  <div className="hidden md:flex absolute top-1/2 -right-3 w-6 h-1 bg-gradient-to-r from-primary to-accent rounded-full" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-border/40">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-foreground mb-8 text-center">About Rehearsals</h2>
          
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="bg-secondary/20 rounded-xl h-80 flex items-center justify-center border border-border/40">
              <Zap className="w-32 h-32 text-primary/20" />
            </div>
            
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-4">Designed for Your Growth</h3>
              <p className="text-muted-foreground mb-4">
                Rehearsals combines cutting-edge AI technology with educational psychology to create immersive learning experiences that matter. Our platform was built specifically for computer science students who want to develop not just technical skills, but also the ethical judgment and reflective thinking essential to responsible innovation.
              </p>
              <p className="text-muted-foreground mb-6">
                Every scenario in Rehearsals is carefully designed to challenge you, support your learning, and help you grow as both a technologist and a thoughtful decision-maker.
              </p>
              <Button 
                size="lg"
                variant="outline"
                className="border border-border text-foreground hover:bg-primary/5"
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-border/40">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-6 text-balance">
            Ready to Start Your Journey?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join computer science students at TMU and experience immersive, intelligent learning
          </p>
          <Button 
            size="lg" 
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl px-10 py-6 text-lg group"
          >
            Access Rehearsals Now
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between text-sm text-muted-foreground">
          <p>© 2025 Rehearsals Learning Platform</p>
          <div className="flex gap-6 mt-4 sm:mt-0">
            <a href="#" className="hover:text-foreground transition">Privacy</a>
            <a href="#" className="hover:text-foreground transition">Terms</a>
            <a href="#" className="hover:text-foreground transition">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
