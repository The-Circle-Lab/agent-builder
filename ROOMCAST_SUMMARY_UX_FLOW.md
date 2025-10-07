# Roomcast Summary Matching - User Experience Flow

## Visual Flow

```
┌─────────────────────────────────────────────────────┐
│  STEP 1: Navigate Through Submissions              │
│  ┌─────────────────────────────────────────────┐   │
│  │  [←]     Your Group's Responses     [→]     │   │
│  │              1 of 4                          │   │
│  │  ┌───────────────────────────────────────┐  │   │
│  │  │  Alice                               │  │   │
│  │  │  ─────────────────────────────────   │  │   │
│  │  │  Website Name: Natural News          │  │   │
│  │  │  URL: https://naturalnews.com        │  │   │
│  │  │  Purpose: Alternative health info    │  │   │
│  │  │  Platform: Independent blog          │  │   │
│  │  └───────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                        ↓
                   (Keep clicking →)
                        ↓
┌─────────────────────────────────────────────────────┐
│  STEP 2: Finish Button Appears at Last Submission  │
│  ┌─────────────────────────────────────────────┐   │
│  │  [←]     Your Group's Responses     [X]     │   │
│  │              4 of 4                          │   │
│  │  ┌───────────────────────────────────────┐  │   │
│  │  │  David                               │  │   │
│  │  │  ─────────────────────────────────   │  │   │
│  │  │  Website Name: Truth Seeker          │  │   │
│  │  │  URL: https://truthseeker.com        │  │   │
│  │  │  Purpose: Questions mainstream sci.  │  │   │
│  │  │  Platform: Independent website       │  │   │
│  │  └───────────────────────────────────────┘  │   │
│  │                                              │   │
│  │           ┌──────────────────┐              │   │
│  │           │  ✓  Finish       │              │   │
│  │           └──────────────────┘              │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                        ↓
                  (Click Finish)
                        ↓
┌─────────────────────────────────────────────────────┐
│  STEP 3: Summary Form                               │
│  ┌─────────────────────────────────────────────┐   │
│  │  Summarize Your Group's Submissions         │   │
│  │  Based on all the submissions you saw...    │   │
│  │                                              │   │
│  │  General Category                            │   │
│  │  ┌────────────────────────────────────────┐ │   │
│  │  │ Health Misinformation Sites           │ │   │
│  │  └────────────────────────────────────────┘ │   │
│  │                                              │   │
│  │  Purpose Summary                             │   │
│  │  ┌────────────────────────────────────────┐ │   │
│  │  │ These sites spread false health info  │ │   │
│  │  │ and conspiracy theories...            │ │   │
│  │  └────────────────────────────────────────┘ │   │
│  │                                              │   │
│  │  Platform Summary                            │   │
│  │  ┌────────────────────────────────────────┐ │   │
│  │  │ Independent blogs and news sites      │ │   │
│  │  └────────────────────────────────────────┘ │   │
│  │                                              │   │
│  │  Strategy                                    │   │
│  │  ┌────────────────────────────────────────┐ │   │
│  │  │ Teach students to verify sources and  │ │   │
│  │  │ check for credible citations...       │ │   │
│  │  └────────────────────────────────────────┘ │   │
│  │                                              │   │
│  │  ┌──────────┐  ┌────────────────────────┐  │   │
│  │  │   Back   │  │ Submit & Find Match    │  │   │
│  │  └──────────┘  └────────────────────────┘  │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                        ↓
                  (Click Submit)
                        ↓
┌─────────────────────────────────────────────────────┐
│  STEP 4: AI Analysis in Progress                    │
│  ┌─────────────────────────────────────────────┐   │
│  │                                              │   │
│  │  ┌──────────┐  ┌────────────────────────┐  │   │
│  │  │   Back   │  │  ⟳  Finding Match...   │  │   │
│  │  └──────────┘  └────────────────────────┘  │   │
│  │                                              │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                        ↓
                  (AI analyzing...)
                        ↓
┌─────────────────────────────────────────────────────┐
│  STEP 5: Match Result Displayed                     │
│  ┌─────────────────────────────────────────────┐   │
│  │                                              │   │
│  │  ┌──────────┐  ┌────────────────────────┐  │   │
│  │  │   Back   │  │ ✓  Match Found!        │  │   │
│  │  └──────────┘  └────────────────────────┘  │   │
│  │                                              │   │
│  │  ┌────────────────────────────────────────┐ │   │
│  │  │  ✓  Best Match Found!                 │ │   │
│  │  │                                        │ │   │
│  │  │  Bob's Submission              92%    │ │   │
│  │  │  ───────────────────────────────────  │ │   │
│  │  │  Website Name: Dr. Mercola            │ │   │
│  │  │  URL: https://mercola.com             │ │   │
│  │  │  Purpose: Sells supplements and       │ │   │
│  │  │           spreads anti-vaccine info   │ │   │
│  │  │  Platform: Health e-commerce site     │ │   │
│  │  │                                        │ │   │
│  │  │  Why This Match?                      │ │   │
│  │  │  Dr. Mercola exemplifies health       │ │   │
│  │  │  misinformation through selling       │ │   │
│  │  │  supplements and spreading anti-      │ │   │
│  │  │  vaccine info without scientific      │ │   │
│  │  │  backing...                           │ │   │
│  │  │                                        │ │   │
│  │  │  All Scores:                          │ │   │
│  │  │  Bob    ████████████████████  92%     │ │   │
│  │  │  Alice  ███████████████       78%     │ │   │
│  │  │  Carol  ████████████          65%     │ │   │
│  │  │  David  ███████████           58%     │ │   │
│  │  └────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Color Coding

- **Green**: Success states (match found, confidence score)
- **Amber/Yellow**: Form inputs and navigation
- **Blue**: AI reasoning and explanations
- **Gray**: Neutral UI elements (back button, progress bars)
- **Red**: Error states (not shown in success flow)

## Interactive Elements

### Buttons
1. **← / →** - Navigate between submissions
2. **Finish** - Appears only at last submission
3. **Back** - Return to navigation view, clears form
4. **Submit & Find Match** - Triggers AI analysis
   - Disabled when: fields empty or analysis in progress
   - Shows spinner when: analysis running
   - Shows checkmark when: match found

### Form Fields
All 4 fields required:
1. General Category (text input)
2. Purpose Summary (textarea, 4 rows)
3. Platform Summary (text input)
4. Strategy (textarea, 4 rows)

### Result Display
- **Header**: "Best Match Found!" with checkmark
- **Student Badge**: Name + confidence % in green
- **Website Details**: Name, URL, purpose, platform
- **Reasoning Box**: Blue background, AI explanation
- **Score Bars**: Visual progress bars for all submissions

## Responsive Behavior

### Loading States
```
Initial: [Submit & Find Match]
         ↓
Loading: [⟳ Finding Match...]  (spinner + disabled)
         ↓
Success: [✓ Match Found!]      (checkmark + green)
```

### Error Handling
```
Error: Alert popup with message
       ↓
Form: Remains open, ready to retry
```

## Accessibility

- All buttons have clear labels
- Form inputs have descriptive placeholders
- Loading states clearly indicated
- Color is not the only indicator (icons + text)
- Keyboard navigation supported
- Screen reader friendly labels

## Mobile Considerations

- Form scales to viewport
- Touch-friendly button sizes (py-3 = 12px padding)
- Scrollable content areas
- Responsive text sizes
- Full-width on small screens
