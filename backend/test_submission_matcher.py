"""
Test script for the submission matcher functionality
"""

import asyncio
from services.deployment_types.submission_matcher import match_summary_to_submission


async def test_misinformation_websites():
    """Test matching with misinformation website submissions"""
    
    print("=" * 70)
    print("TEST 1: Misinformation Websites")
    print("=" * 70)
    
    # Summary from the roomcast form
    summary_data = {
        'category': 'Health Misinformation Sites',
        'purpose': 'These websites spread false health information, alternative medicine claims without evidence, and conspiracy theories about vaccines and medical treatments',
        'platform': 'Independent blogs and alternative news sites',
        'strategy': 'Teach students to verify medical claims with scientific sources, check for peer-reviewed evidence, and identify red flags like lack of citations or sensationalist language'
    }
    
    # Sample website submissions from students
    website_submissions = [
        {
            'student_name': 'Alice Johnson',
            'url': 'https://naturalnews.example.com',
            'name': 'Natural News',
            'purpose': 'Promotes alternative health remedies and questions mainstream medical science',
            'platform': 'Independent health blog'
        },
        {
            'student_name': 'Bob Smith',
            'url': 'https://mercola.example.com',
            'name': 'Dr. Mercola',
            'purpose': 'Sells supplements and spreads anti-vaccine information',
            'platform': 'Health e-commerce site'
        },
        {
            'student_name': 'Carol Davis',
            'url': 'https://healthimpactnews.example.com',
            'name': 'Health Impact News',
            'purpose': 'Publishes unverified health claims and conspiracy theories about pharmaceuticals',
            'platform': 'Alternative news blog'
        },
        {
            'student_name': 'David Wilson',
            'url': 'https://greenmedinfo.example.com',
            'name': 'GreenMedInfo',
            'purpose': 'Promotes natural medicine as superior to conventional treatments without scientific backing',
            'platform': 'Health information site'
        }
    ]
    
    # Run the matching
    result = await match_summary_to_submission(
        summary_data=summary_data,
        website_submissions=website_submissions,
        matching_strategy="comprehensive"
    )
    
    # Display results
    print("\n📊 MATCHING RESULTS:")
    print(f"\n🏆 BEST MATCH: {result.best_match_student}")
    print(f"   Website: {result.best_match_submission.name}")
    print(f"   URL: {result.best_match_submission.url}")
    print(f"   Confidence Score: {result.similarity_score:.2%}")
    
    print(f"\n💭 REASONING:")
    print(f"   {result.reasoning}")
    
    print(f"\n📈 ALL SCORES:")
    for student, score in sorted(result.all_scores.items(), key=lambda x: x[1], reverse=True):
        print(f"   {student}: {score:.2%}")
    
    print("\n" + "=" * 70 + "\n")


async def test_social_media_platforms():
    """Test matching with social media platform submissions"""
    
    print("=" * 70)
    print("TEST 2: Social Media Platforms")
    print("=" * 70)
    
    summary_data = {
        'category': 'Viral Misinformation on Social Media',
        'purpose': 'These platforms are used to rapidly spread false information through shares and engagement algorithms',
        'platform': 'Major social media platforms',
        'strategy': 'Help students understand how algorithmic amplification works and how to fact-check viral content before sharing'
    }
    
    website_submissions = [
        {
            'student_name': 'Emma Taylor',
            'url': 'https://facebook.com',
            'name': 'Facebook',
            'purpose': 'Social networking site where misinformation spreads through friend networks and groups',
            'platform': 'Social media'
        },
        {
            'student_name': 'Frank Martinez',
            'url': 'https://twitter.com',
            'name': 'Twitter/X',
            'purpose': 'Microblogging platform where false claims can go viral through retweets',
            'platform': 'Social media'
        },
        {
            'student_name': 'Grace Lee',
            'url': 'https://tiktok.com',
            'name': 'TikTok',
            'purpose': 'Video platform where misleading content spreads through algorithm recommendations',
            'platform': 'Social media'
        }
    ]
    
    result = await match_summary_to_submission(
        summary_data=summary_data,
        website_submissions=website_submissions,
        matching_strategy="comprehensive"
    )
    
    print("\n📊 MATCHING RESULTS:")
    print(f"\n🏆 BEST MATCH: {result.best_match_student}")
    print(f"   Website: {result.best_match_submission.name}")
    print(f"   Confidence Score: {result.similarity_score:.2%}")
    print(f"\n💭 REASONING: {result.reasoning}")
    print(f"\n📈 ALL SCORES:")
    for student, score in sorted(result.all_scores.items(), key=lambda x: x[1], reverse=True):
        print(f"   {student}: {score:.2%}")
    
    print("\n" + "=" * 70 + "\n")


async def test_with_different_strategies():
    """Test different matching strategies"""
    
    print("=" * 70)
    print("TEST 3: Different Matching Strategies")
    print("=" * 70)
    
    summary_data = {
        'category': 'Climate Denial Websites',
        'purpose': 'Sites that deny or minimize climate change science',
        'platform': 'News and opinion sites',
        'strategy': 'Teach critical evaluation of climate science sources'
    }
    
    website_submissions = [
        {
            'student_name': 'Henry Chen',
            'url': 'https://climatedepot.example.com',
            'name': 'Climate Depot',
            'purpose': 'Questions climate change science and promotes skepticism',
            'platform': 'News aggregator'
        },
        {
            'student_name': 'Iris Wang',
            'url': 'https://wattsupwiththat.example.com',
            'name': 'Watts Up With That',
            'purpose': 'Blog that challenges mainstream climate science',
            'platform': 'Independent blog'
        }
    ]
    
    strategies = ["comprehensive", "purpose_focused", "platform_focused"]
    
    for strategy in strategies:
        print(f"\n🔍 Testing with '{strategy}' strategy:")
        result = await match_summary_to_submission(
            summary_data=summary_data,
            website_submissions=website_submissions,
            matching_strategy=strategy
        )
        print(f"   Best Match: {result.best_match_student} (Score: {result.similarity_score:.2%})")
        print(f"   Reasoning: {result.reasoning[:100]}...")
    
    print("\n" + "=" * 70 + "\n")


async def main():
    """Run all tests"""
    print("\n🧪 SUBMISSION MATCHER TEST SUITE\n")
    
    await test_misinformation_websites()
    await test_social_media_platforms()
    await test_with_different_strategies()
    
    print("✅ All tests completed!\n")


if __name__ == "__main__":
    asyncio.run(main())
