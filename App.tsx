import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Chat } from '@google/genai';
import { startNewChatSession, sendStreamedMessage } from './services/geminiService';
import { ChatMessage } from './types';
import LoginScreen from './components/LoginScreen';
import ChatScreen from './components/ChatScreen';
import Sidebar from './components/Sidebar';
import EducationScreen from './components/EducationScreen';
import ArticleScreen from './components/ArticleScreen';
import MoodTrackerScreen from './components/MoodTrackerScreen';
import EmotionJournalScreen from './components/EmotionJournalScreen';
import QuizScreen from './components/QuizScreen';
import { ChatIcon, CloseIcon } from './components/icons/Icons';

type View = 'chat' | 'education' | 'article' | 'mood' | 'journal' | 'quiz';

enum TransitionState {
    IDLE,
    FADING_OUT,
    FADING_IN,
}

const App: React.FC = () => {
    const [userName, setUserName] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<View>('chat');
    const [viewToRender, setViewToRender] = useState<View>('chat');
    const [transitionState, setTransitionState] = useState<TransitionState>(TransitionState.IDLE);
    const [showNotification, setShowNotification] = useState(false);
    const notificationAudioRef = useRef<HTMLAudioElement>(null);

    // --- Chat State Lifted from ChatScreen ---
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [historyState, setHistoryState] = useState<'checking' | 'prompting' | 'ready'>('checking');
    const chatRef = useRef<Chat | null>(null);
    // --- End of Lifted State ---

    const handleLogin = useCallback((name: string) => {
        if (name.trim()) {
            setUserName(name.trim());
        }
    }, []);

    const handleNavigate = useCallback((view: View) => {
        if (view === 'chat') {
            setShowNotification(false);
        }
        if (transitionState === TransitionState.IDLE && view !== activeView) {
            setActiveView(view);
            setTransitionState(TransitionState.FADING_OUT);
        }
    }, [activeView, transitionState]);

    const handleNotificationClick = () => {
        setShowNotification(false);
        handleNavigate('chat');
    };
    
    useEffect(() => {
        if (transitionState === TransitionState.FADING_OUT) {
            const timer = setTimeout(() => {
                setViewToRender(activeView);
                setTransitionState(TransitionState.FADING_IN);
            }, 300);
            return () => clearTimeout(timer);
        }
        if (transitionState === TransitionState.FADING_IN) {
            const timer = setTimeout(() => {
                setTransitionState(TransitionState.IDLE);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [transitionState, activeView]);

    // --- Chat Logic Lifted from ChatScreen ---
    const startNewChat = useCallback(() => {
        localStorage.removeItem('vivekaChatHistory');
        const initialMessages: ChatMessage[] = [{ sender: 'bot', text: `Hai, ${userName}. Terima kasih telah datang. Ceritakan apa yang kamu rasakan hari ini.` }];
        setMessages(initialMessages);
        chatRef.current = startNewChatSession(initialMessages);
        setHistoryState('ready');
    }, [userName]);

    const continueChat = useCallback(() => {
        const storedHistory = localStorage.getItem('vivekaChatHistory');
        if (storedHistory) {
            try {
                const parsedHistory: ChatMessage[] = JSON.parse(storedHistory);
                chatRef.current = startNewChatSession(parsedHistory);
                setMessages(parsedHistory);
                setHistoryState('ready');
            } catch (e) {
                console.error("Failed to parse history, starting new chat.", e);
                startNewChat();
            }
        } else {
            startNewChat();
        }
    }, [startNewChat]);

    useEffect(() => {
        if (!userName) return;
        try {
            const storedHistory = localStorage.getItem('vivekaChatHistory');
            if (storedHistory) {
                const parsedHistory: ChatMessage[] = JSON.parse(storedHistory);
                if (parsedHistory && parsedHistory.length > 1) {
                    setMessages(parsedHistory);
                    setHistoryState('prompting');
                } else {
                    startNewChat();
                }
            } else {
                startNewChat();
            }
        } catch (e) {
            console.error("Failed to load chat history, starting new chat.", e);
            startNewChat();
        }
    }, [userName, startNewChat]);

    useEffect(() => {
        if (historyState === 'ready' && messages.length > 0 && !isLoading) {
            try {
                localStorage.setItem('vivekaChatHistory', JSON.stringify(messages));
            } catch (e) {
                console.error("Failed to save chat history", e);
            }
        }
    }, [messages, historyState, isLoading]);
    
    const handleSendMessage = useCallback(async (textToSend: string) => {
        if (!textToSend.trim() || !chatRef.current) return;
        
        const userMessage: ChatMessage = { sender: 'user', text: textToSend.trim() };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        let botResponse = '';
        let isFirstChunk = true;

        await sendStreamedMessage(chatRef.current, textToSend.trim(), (chunk) => {
            botResponse += chunk;
            if (isFirstChunk) {
                setMessages(prev => [...prev, { sender: 'bot', text: botResponse }]);
                isFirstChunk = false;
            } else {
                setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage?.sender === 'bot') {
                        lastMessage.text = botResponse;
                    }
                    return newMessages;
                });
            }
        });
        
        setIsLoading(false);
        if (activeView !== 'chat') {
            setShowNotification(true);
            notificationAudioRef.current?.play().catch(e => console.error("Notification sound failed", e));
        }
    }, [activeView]);
    // --- End of Lifted Logic ---

    const getAnimationClass = () => {
        switch (transitionState) {
            case TransitionState.FADING_OUT:
                return 'opacity-0';
            case TransitionState.FADING_IN:
            case TransitionState.IDLE:
            default:
                return 'opacity-100';
        }
    };

    const renderView = () => {
        switch (viewToRender) {
            case 'chat': return <ChatScreen 
                userName={userName!} 
                messages={messages}
                setMessages={setMessages}
                isLoading={isLoading}
                historyState={historyState}
                onSendMessage={handleSendMessage}
                onStartNewChat={startNewChat}
                onContinueChat={continueChat}
            />;
            case 'education': return <EducationScreen />;
            case 'article': return <ArticleScreen />;
            case 'mood': return <MoodTrackerScreen />;
            case 'journal': return <EmotionJournalScreen />;
            case 'quiz': return <QuizScreen />;
            default: return null;
        }
    };

    if (!userName) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    return (
        <div className="flex h-screen w-screen bg-gradient-to-br from-blue-100 via-blue-50 to-white text-slate-800">
            {showNotification && (
                <div 
                    onClick={handleNotificationClick}
                    className="fixed top-5 right-5 z-50 flex items-center gap-4 px-4 py-3 rounded-xl shadow-2xl cursor-pointer bg-white/80 backdrop-blur-md border border-blue-200/50 animate-slide-in-down"
                    role="alert"
                    aria-live="polite"
                >
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white ring-4 ring-white/50">
                        <ChatIcon className="w-6 h-6"/>
                    </div>
                    <div>
                        <p className="font-semibold text-blue-800">Pesan baru dari ViVeka</p>
                        <p className="text-sm text-slate-600">Klik untuk melihat</p>
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setShowNotification(false); }}
                        className="p-1.5 rounded-full text-slate-500 hover:bg-slate-200/70 transition-colors"
                        aria-label="Tutup notifikasi"
                    >
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>
            )}
            <audio ref={notificationAudioRef}>
                <source src="https://cdn.pixabay.com/audio/2022/10/28/audio_36596d25f3.mp3" type="audio/mpeg" />
            </audio>

            <Sidebar activeView={activeView} onNavigate={handleNavigate} />
            <main className={`flex-1 h-screen overflow-y-hidden transition-opacity duration-300 ease-in-out ${getAnimationClass()}`}>
                 {renderView()}
            </main>
        </div>
    );
};

export default App;