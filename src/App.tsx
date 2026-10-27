import { useEffect, useMemo, useState } from 'react'
import { Archive, ArrowLeft, BookOpen, Check, FileText, FileUp, FolderOpen, Home, Library, LogOut, Menu, RotateCcw, Settings, Sparkles, Trash2, UserCircle, Wand2, X } from 'lucide-react'
import { templates } from './data/templates'
import { fileAcceptList, parseSourceFile } from './services/documentService'
import { generateMaterialWithApi } from './services/aiService'
import { clearSession, loadDisplayName, loadLibrary, loadProfileIcon, loadSession, registerAccount, saveDisplayName, saveLibrary, saveProfileIcon, saveSourceDocument, signIn } from './services/storageService'
import type { MaterialOptions, MaterialRecord, MaterialType, ProfileIcon, SourceDocument } from './types'
import { PeachLogo } from './components/PeachLogo'
import { FruitIcon, type FruitIconName } from './components/FruitIcon'
import './App.css'

const defaultOptions: MaterialOptions = { tone: 'supportive', detail: 2, quizQuestionCount: 20, randomize: true, saveToLibrary: true, customInstructions: { reviewer: '', summary: '', flashcards: '', quiz: '', 'ppt-outline': '' } }

function App() {
  const [user, setUser] = useState<string | null>(() => loadSession())
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin')
  const [authName, setAuthName] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [activeTab, setActiveTab] = useState<'home' | 'library' | 'profile' | 'settings'>('home')
  const [selectedSource, setSelectedSource] = useState<SourceDocument | null>(null)
  const [library, setLibrary] = useState<MaterialRecord[]>([])
  const [profileIcon, setProfileIcon] = useState<ProfileIcon>('peach')
  const [displayName, setDisplayName] = useState('')
  const [selectedType, setSelectedType] = useState<MaterialType>('reviewer')
  const [options, setOptions] = useState<MaterialOptions>(defaultOptions)
  const [preview, setPreview] = useState<MaterialRecord | null>(null)
  const [status, setStatus] = useState('Choose a study snack to get started.')
  const [error, setError] = useState<string | null>(null)
  const [showSnackSettings, setShowSnackSettings] = useState(false)
  const [flashcardIndex, setFlashcardIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showProfileSaved, setShowProfileSaved] = useState(false)

  useEffect(() => { if (user) { setLibrary(loadLibrary(user)); setProfileIcon(loadProfileIcon(user)); setDisplayName(loadDisplayName(user)) } }, [user])
  useEffect(() => { saveLibrary(user, library) }, [user, library])
  const selectedTemplate = useMemo(() => templates.find((template) => template.id === selectedType) ?? templates[0], [selectedType])
  const activeCards = preview?.flashcards ?? []

  const handleAuth = () => {
    const result = authMode === 'signin' ? signIn(authName, authPassword) : registerAccount(authName, authPassword)
    if (!result.ok) { setAuthError(result.message); return }
    setUser(authName.trim().toLowerCase()); setAuthError(''); setAuthPassword(''); setStatus(result.message)
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try { setError(null); setStatus(`Reading ${file.name}...`); const parsed = await parseSourceFile(file); setSelectedSource(parsed); saveSourceDocument(parsed); setStatus('Lesson ready. Pick a snack and generate it.') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not read that file.'); setStatus('Import failed.') }
    finally { event.target.value = '' }
  }

  const handleGenerate = async () => {
    if (!selectedSource) { setError('Add a lesson before generating.'); return }
    setIsGenerating(true); setError(null); setStatus(`Making your ${selectedTemplate.label.toLowerCase()}...`)
    try { const material = await generateMaterialWithApi(selectedSource, selectedType, options); setPreview(material); if (options.saveToLibrary) setLibrary((current) => [material, ...current]); setFlashcardIndex(0); setRevealed(false); setStatus(options.saveToLibrary ? `${selectedTemplate.label} is ready and saved to My library.` : `${selectedTemplate.label} is ready. It was not saved.`) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Generation failed.'); setStatus('Generation failed.') }
    finally { setIsGenerating(false) }
  }

  const archiveMaterial = (id: string) => setLibrary((current) => current.map((item) => item.id === id ? { ...item, archived: !item.archived, updatedAt: new Date().toISOString() } : item))
  const deleteMaterial = (id: string) => setLibrary((current) => current.filter((item) => item.id !== id))
  const handleSaveProfile = () => { saveDisplayName(user, displayName); saveProfileIcon(user, profileIcon); setStatus('Profile saved.'); setShowProfileSaved(true) }
  const handleSavePreview = () => {
    if (!preview) return
    if (library.some((item) => item.id === preview.id)) { setStatus('This material is already in My library.'); return }
    setLibrary((current) => [preview, ...current]); setStatus('Saved to My library.')
  }

  if (!user) return <AuthPage mode={authMode} setMode={setAuthMode} name={authName} setName={setAuthName} password={authPassword} setPassword={setAuthPassword} error={authError} onSubmit={handleAuth} />

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-wrap"><div className="brand-mark sidebar-logo"><PeachLogo /></div><div><p className="eyebrow">your cozy study nook</p><h1 className="brand-name">PEACH&PEN</h1></div></div>
        <button type="button" className="profile-mini" onClick={() => setActiveTab('profile')}>
          <FruitIcon type={profileIcon as FruitIconName} />
          <span><strong>{displayName || 'Your profile'}</strong><small>@{user}</small></span>
          <UserCircle size={15} />
        </button>
        <nav className="sidebar-nav" aria-label="Main navigation">
        <p className="eyebrow">Your little space</p>
        <NavButton icon={<Home size={17} />} active={activeTab === 'home'} onClick={() => setActiveTab('home')}>Home</NavButton>
        <NavButton icon={<Library size={17} />} active={activeTab === 'library'} onClick={() => setActiveTab('library')}>My library <span className="nav-count">{library.length}</span></NavButton>
        <NavButton icon={<UserCircle size={17} />} active={activeTab === 'profile'} onClick={() => setActiveTab('profile')}>Profile</NavButton>
        <NavButton icon={<Settings size={17} />} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>Settings</NavButton>
      </nav>
      <div className="sidebar-footer"><span>Goodbye!</span><button type="button" className="logout-button" title="Sign out" onClick={() => { clearSession(); setUser(null) }}><LogOut size={16} /><span>Log out</span></button></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><div className="topbar-title"><BookOpen size={18} /> <span>{activeTab === 'home' ? 'Today’s little study corner' : activeTab === 'library' ? 'Your saved study materials' : activeTab === 'profile' ? 'Your profile' : 'Workspace settings'}</span></div><button type="button" className="mobile-menu"><Menu size={18} /></button></header>
      {activeTab === 'home' && <HomeView selectedSource={selectedSource} selectedType={selectedType} setSelectedType={setSelectedType} selectedTemplate={selectedTemplate} onGenerate={handleGenerate} isGenerating={isGenerating} onOpenSettings={() => setShowSnackSettings(true)} onAddLesson={() => document.getElementById('lesson-upload')?.click()} onUpload={handleUpload} preview={preview} isPreviewSaved={preview ? library.some((item) => item.id === preview.id) : false} onSavePreview={handleSavePreview} status={status} error={error} activeCards={activeCards} flashcardIndex={flashcardIndex} setFlashcardIndex={setFlashcardIndex} revealed={revealed} setRevealed={setRevealed} />}
      {activeTab === 'library' && <LibraryView library={library} onArchive={archiveMaterial} onDelete={deleteMaterial} onOpen={(item) => { setPreview(item); setSelectedType(item.type); setActiveTab('home') }} />}
      {activeTab === 'profile' && <ProfileView user={user} displayName={displayName} setDisplayName={setDisplayName} onSave={handleSaveProfile} onBack={() => setActiveTab('home')} icon={profileIcon} setIcon={setProfileIcon} libraryCount={library.length} />}
      {activeTab === 'settings' && <section className="panel page-card"><Settings size={36} /><h2>Workspace settings</h2><p>Customize each study snack from the settings button on the home page.</p><button type="button" className="secondary-button" onClick={() => setShowSnackSettings(true)}><Wand2 size={16} /> Open snack settings</button></section>}
    </main>
    {showSnackSettings && <SnackSettings selectedType={selectedType} options={options} setOptions={setOptions} onClose={() => setShowSnackSettings(false)} />}
    {showProfileSaved && <div className="modal-backdrop"><section className="success-modal" role="dialog" aria-modal="true" aria-labelledby="profile-saved-title"><div className="success-icon"><Check size={24} /></div><h2 id="profile-saved-title">Study nook saved!</h2><p>Your profile icon and display name have been updated.</p><button type="button" className="primary-button" onClick={() => setShowProfileSaved(false)}>Okay</button></section></div>}
  </div>
}

function ProfileView({ user, displayName, setDisplayName, onSave, onBack, icon, setIcon, libraryCount }: { user: string; displayName: string; setDisplayName: (value: string) => void; onSave: () => void; onBack: () => void; icon: ProfileIcon; setIcon: (icon: ProfileIcon) => void; libraryCount: number }) {
  const choices: { name: ProfileIcon; label: string }[] = [{ name: 'peach', label: 'Peach' }, { name: 'apple', label: 'Apple' }, { name: 'strawberry', label: 'Strawberry' }, { name: 'kiwi', label: 'Kiwi' }, { name: 'banana', label: 'Banana' }]
  return <section className="profile-page panel">
    <button type="button" className="secondary-button profile-back-button" onClick={onBack}><ArrowLeft size={16} /> Back to home</button>
    <div className="profile-hero"><div className="profile-avatar"><FruitIcon type={icon as FruitIconName} /></div><div><p className="eyebrow accent">Your little profile</p><h2>{displayName || 'Your little profile'}</h2><p className="profile-username">@{user}</p><p>Choose a tiny fruit friend for your study nook.</p></div></div>
    <label className="display-name-field">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How should we call you?" /></label>
    <div className="profile-stat"><strong>{libraryCount}</strong><span>saved materials</span></div>
    <h3>Profile picture</h3>
    <div className="fruit-picker">{choices.map((choice) => <button type="button" key={choice.name} className={icon === choice.name ? 'fruit-choice selected' : 'fruit-choice'} onClick={() => setIcon(choice.name)}><span className="fruit-choice-art"><FruitIcon type={choice.name as FruitIconName} /></span><small>{choice.label}</small></button>)}</div>
    <button type="button" className="primary-button profile-save-button" onClick={onSave}><Check size={16} /> Save profile</button>
  </section>
}
function AuthPage({ mode, setMode, name, setName, password, setPassword, error, onSubmit }: { mode: 'signin' | 'register'; setMode: (mode: 'signin' | 'register') => void; name: string; setName: (value: string) => void; password: string; setPassword: (value: string) => void; error: string; onSubmit: () => void }) {
  return <div className="auth-page"><div className="auth-art"><div className="brand-mark large"><PeachLogo /></div><p className="eyebrow accent">a sweeter way to study</p><h1>PEACH <span>&amp;</span> PEN</h1><p>Turn lessons into small, lovely moments of progress.</p></div><form className="auth-card" onSubmit={(event) => { event.preventDefault(); onSubmit() }}><PeachLogo className="auth-icon" /><h2>{mode === 'signin' ? 'Welcome back' : 'Make your study nook'}</h2><p>{mode === 'signin' ? 'Sign in to pick up where you left off.' : 'Create an account to keep your library with you.'}</p><label>Username<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="username" required /></label><label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required /></label>{error && <p className="form-error">{error}</p>}<button type="submit" className="primary-button">{mode === 'signin' ? 'Sign in' : 'Create account'}</button><button type="button" className="text-button" onClick={() => setMode(mode === 'signin' ? 'register' : 'signin')}>{mode === 'signin' ? 'New here? Make an account' : 'Already have an account? Sign in'}</button></form></div>
}

function NavButton({ icon, active, onClick, children }: { icon: React.ReactNode; active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}>{icon}{children}</button> }

function HomeView({ selectedSource, selectedType, setSelectedType, selectedTemplate, onGenerate, isGenerating, onOpenSettings, onAddLesson, onUpload, preview, isPreviewSaved, onSavePreview, status, error, activeCards, flashcardIndex, setFlashcardIndex, revealed, setRevealed }: any) {
  const currentCard = activeCards[flashcardIndex]
  return <>
    <section className="hero-card"><div><p className="eyebrow accent">A little learning goes a long way</p><h2>Good things grow from a little studying with a study buddy!</h2><p>Drop in a file, choose a study snack, and make learning feel a little peachy.</p><input id="lesson-upload" type="file" accept={fileAcceptList()} onChange={onUpload} hidden /></div><div className="peach-illustration"><PeachLogo /><span>Peanie</span></div></section>
    <section className="snack-picker panel"><div className="section-heading"><div><p className="eyebrow accent">Choose your format</p><h2>Pick your study snack</h2></div><button type="button" className="icon-button" title="Customize snack settings" onClick={onOpenSettings}><Settings size={18} /></button></div><div className="template-grid">{templates.map((template) => <button key={template.id} type="button" className={selectedType === template.id ? 'template-card selected' : 'template-card'} onClick={() => setSelectedType(template.id)}><span className={`dot dot-${template.accent}`} /><strong>{template.label}</strong><small>{template.description}</small>{selectedType === template.id && <Check size={16} />}</button>)}</div></section>
    <section className="content-grid"><section className="panel source-panel"><h3><FileText size={17} /> Your lesson</h3>{selectedSource ? <><p className="filename">{selectedSource.fileName}</p><p className="meta">{selectedSource.kind.toUpperCase()} · {selectedSource.sizeBytes.toLocaleString()} bytes</p><p className="lesson-ready-note">Lesson is ready. Its contents stay hidden here and are used to make your study materials.</p><button type="button" className="secondary-button lesson-upload-button" onClick={onAddLesson}><FileUp size={15} /> Replace lesson</button></> : <div className="empty-state"><FileUp size={22} /><span>No lesson yet. Add a PDF, DOCX, TXT, or Markdown file.</span><button type="button" className="secondary-button" onClick={onAddLesson}><FileUp size={15} /> Add lesson</button></div>}</section><section className="panel preview-panel"><div className="section-heading"><h3><Sparkles size={17} /> Freshly made</h3><div className="preview-actions"><button type="button" className="secondary-button" onClick={onGenerate} disabled={!selectedSource || isGenerating}><Wand2 size={15} /> {isGenerating ? 'Making…' : `Make my ${selectedTemplate.label.toLowerCase()}`}</button>{preview && <button type="button" className="primary-button save-material-button" onClick={onSavePreview} disabled={isPreviewSaved}><Check size={15} /> {isPreviewSaved ? 'Saved to library' : 'Save to library'}</button>}</div></div>{preview?.type === 'quiz' && preview.quizQuestions?.length ? <QuizView questions={preview.quizQuestions} /> : preview?.type === 'flashcards' && currentCard ? <FlashcardView card={currentCard} index={flashcardIndex} total={activeCards.length} revealed={revealed} setRevealed={setRevealed} next={() => { setFlashcardIndex((flashcardIndex + 1) % activeCards.length); setRevealed(false) }} previous={() => { setFlashcardIndex((flashcardIndex - 1 + activeCards.length) % activeCards.length); setRevealed(false) }} /> : preview ? <MaterialContent content={preview.content} /> : <div className="empty-state"><Sparkles size={22} /><span>Your {selectedTemplate.label.toLowerCase()} will appear here.</span></div>}</section></section>
    <section className="status-panel"><div className="status-pill">Status</div><p>{status}</p>{error && <p className="error-text">{error}</p>}</section>
  </>
}

function MaterialContent({ content }: { content: string }) {
  const lines = content.replace(/\uFFFD/g, ' ').split(/\r?\n/)
  return <div className="material-content">
    {lines.map((line, index) => {
      const heading = line.match(/^(#{1,6})\s+(.+)$/)
      const bullet = line.match(/^\s*[-*+]\s+(.+)$/)
      const numbered = line.match(/^\s*(\d+)[.)]\s+(.+)$/)
      if (heading) {
        const Heading = heading[1].length <= 2 ? 'h2' : heading[1].length === 3 ? 'h3' : 'h4'
        return <Heading key={index}>{formatMaterialLine(heading[2])}</Heading>
      }
      if (bullet) return <p className="material-bullet" key={index}>{formatMaterialLine(bullet[1])}</p>
      if (numbered) return <p className="material-numbered" key={index}><span>{numbered[1]}.</span>{formatMaterialLine(numbered[2])}</p>
      if (!line.trim()) return <div className="material-spacer" key={index} />
      return <p key={index}>{formatMaterialLine(line)}</p>
    })}
  </div>
}

function formatMaterialLine(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part,
  )
}

function QuizView({ questions }: { questions: any[] }) {
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [fill, setFill] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState(0)
  const [scoredQuestion, setScoredQuestion] = useState<number | null>(null)
  const question = questions[index]
  const answer = Array.isArray(question.answer) ? question.answer : [question.answer]
  const hasAnswer = question.type === 'fill' ? fill.trim().length > 0 : selected.length > 0
  const isCorrect = submitted && (question.type === 'fill' ? fill.trim().toLowerCase() === answer[0].trim().toLowerCase() : selected.length === answer.length && selected.every((choice) => answer.includes(choice)))
  const choose = (choice: string) => { setSubmitted(false); setScoredQuestion(null); setSelected((current) => question.type === 'checkbox' ? current.includes(choice) ? current.filter((item) => item !== choice) : [...current, choice] : [choice]) }
  const checkAnswer = () => { if (!hasAnswer) return; const correct = question.type === 'fill' ? fill.trim().toLowerCase() === answer[0].trim().toLowerCase() : selected.length === answer.length && selected.every((choice) => answer.includes(choice)); setSubmitted(true); if (correct && scoredQuestion !== index) { setScore((current) => current + 1); setScoredQuestion(index) } }
  const nextQuestion = () => { setIndex((current) => (current + 1) % questions.length); setSelected([]); setFill(''); setSubmitted(false); setScoredQuestion(null) }
  const previousQuestion = () => { setIndex((current) => (current - 1 + questions.length) % questions.length); setSelected([]); setFill(''); setSubmitted(false); setScoredQuestion(null) }
  return <div className="quiz-area"><div className="quiz-header"><div className="quiz-progress">Question {index + 1} of {questions.length} · {question.type === 'fill' ? 'Fill in the blank' : question.type === 'checkbox' ? 'Choose all that apply' : 'Choose one'}</div><div className="quiz-score">Score: {score} / {questions.length}</div></div><h4 className="quiz-question">{question.question}</h4>{question.type === 'fill' ? <input className="quiz-fill" value={fill} onChange={(event) => { setFill(event.target.value); setSubmitted(false); setScoredQuestion(null) }} placeholder="Type your answer…" /> : <div className="quiz-options">{question.options?.map((option: string) => <label key={option} className={selected.includes(option) ? 'quiz-option selected' : 'quiz-option'}><input type={question.type === 'checkbox' ? 'checkbox' : 'radio'} checked={selected.includes(option)} onChange={() => choose(option)} /> <span>{option}</span></label>)}</div>}<div className="quiz-actions"><button type="button" className="secondary-button" onClick={previousQuestion}>Previous</button>{hasAnswer && !submitted && <button type="button" className="secondary-button" onClick={checkAnswer}>Check answer</button>}<button type="button" className="secondary-button" onClick={nextQuestion}>Next <Wand2 size={15} /></button></div>{submitted && <div className={isCorrect ? 'quiz-feedback correct' : 'quiz-feedback'}>{isCorrect ? 'Correct — nice work!' : 'Not quite yet. Review the lesson and try again.'}</div>}</div>
}
function FlashcardView({ card, index, total, revealed, setRevealed, next, previous }: any) { return <div className="flashcard-area"><button type="button" className={revealed ? 'flashcard revealed' : 'flashcard'} onClick={() => setRevealed(!revealed)} aria-label="Tap to reveal the answer"><span className="card-label">{revealed ? 'Answer' : 'Question'} · {index + 1} / {total}</span><strong>{revealed ? card.answer : card.question}</strong><span className="tap-hint">{revealed ? 'Tap to hide answer' : 'Tap the card to reveal the answer'}</span></button><div className="flashcard-controls"><button type="button" className="secondary-button" onClick={previous}><RotateCcw size={15} /> Previous</button><button type="button" className="secondary-button" onClick={next}>Next <Wand2 size={15} /></button></div></div> }

function LibraryView({ library, onArchive, onDelete, onOpen }: { library: MaterialRecord[]; onArchive: (id: string) => void; onDelete: (id: string) => void; onOpen: (item: MaterialRecord) => void }) { const visible = library.filter((item) => !item.archived); return <section className="library-panel panel"><div className="section-heading"><div><p className="eyebrow accent">Your saved work</p><h2>My library</h2></div><span className="count-pill">{visible.length} active</span></div><div className="library-list">{library.length ? library.map((item) => <article key={item.id} className={item.archived ? 'library-item archived' : 'library-item'}><button type="button" className="library-open" onClick={() => onOpen(item)}><strong>{item.title}</strong><span>{item.sourceName} · {new Date(item.createdAt).toLocaleDateString()}</span><p>{item.content.slice(0, 150)}{item.content.length > 150 ? '…' : ''}</p></button><div className="item-actions"><button type="button" className="icon-button" title={item.archived ? 'Unarchive' : 'Archive'} onClick={() => onArchive(item.id)}><Archive size={16} /></button><button type="button" className="icon-button danger" title="Delete" onClick={() => onDelete(item.id)}><Trash2 size={16} /></button></div></article>) : <div className="empty-state"><FolderOpen size={22} /><span>Your generated materials will be saved here.</span></div>}</div></section> }

function SnackSettings({ selectedType, options, setOptions, onClose }: any) { const label = templates.find((item) => item.id === selectedType)?.label ?? 'Study snack'; const isPowerPointOutline = selectedType === 'ppt-outline'; return <div className="modal-backdrop"><section className="settings-modal"><div className="section-heading"><div><p className="eyebrow accent">Personalize generation</p><h2>{label} settings</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div><label>Tone<select value={options.tone} onChange={(event) => setOptions((current: MaterialOptions) => ({ ...current, tone: event.target.value }))}><option value="supportive">Supportive</option><option value="balanced">Balanced</option><option value="concise">Concise</option></select></label><label>Detail level<input type="range" min="1" max="3" value={options.detail} onChange={(event) => setOptions((current: MaterialOptions) => ({ ...current, detail: Number(event.target.value) }))} /><span className="eyebrow">Level {options.detail} of 3</span></label><label className="check-row"><input type="checkbox" checked={options.saveToLibrary} onChange={(event) => setOptions((current: MaterialOptions) => ({ ...current, saveToLibrary: event.target.checked }))} /> Save generated materials to My library</label>{selectedType === 'quiz' && <label>Questions<select value={options.quizQuestionCount} onChange={(event) => setOptions((current: MaterialOptions) => ({ ...current, quizQuestionCount: Number(event.target.value) }))}><option value="10">10 questions</option><option value="20">20 questions</option><option value="30">30 questions</option></select></label>}{selectedType === 'flashcards' && <label className="check-row"><input type="checkbox" checked={options.randomize} onChange={(event) => setOptions((current: MaterialOptions) => ({ ...current, randomize: event.target.checked }))} /> Randomize cards</label>}<label>{isPowerPointOutline ? 'Custom outline structure' : 'Custom instructions'}<textarea value={options.customInstructions[selectedType]} onChange={(event) => setOptions((current: MaterialOptions) => ({ ...current, customInstructions: { ...current.customInstructions, [selectedType]: event.target.value } }))} placeholder={isPowerPointOutline ? 'Introduction\nKey concepts\nExamples\nConclusion' : 'Example: include definitions, examples, and a 3-step recap.'} /></label>{isPowerPointOutline && <p className="field-hint">Enter one slide or section per line. The outline will use these as its slide headings.</p>}<p className="api-note"><Sparkles size={15} /> Optional Gemini 2.5 Flash support can be connected with a secure server-side API endpoint.</p><button type="button" className="primary-button" onClick={onClose}><Check size={16} /> Save snack settings</button></section></div> }

export default App
