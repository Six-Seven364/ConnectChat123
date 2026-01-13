import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Mic, MicOff, Video, VideoOff, Phone, Monitor, Users, X } from 'lucide-react';
import { motion } from 'framer-motion';

const VideoCall = ({ conversation, callType, isInitiator, callerId, onEndCall }) => {
  const { user, token } = useAuth();
  const { emit, on, off } = useSocket();
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'audio');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callStatus, setCallStatus] = useState(isInitiator ? 'calling' : 'connected');
  
  const localVideoRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const screenStreamRef = useRef(null);

  const config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  const getOtherParticipants = useCallback(() => {
    return conversation?.participants?.filter(p => p.id !== user?.id) || [];
  }, [conversation, user]);

  const initializeMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: callType === 'video',
        audio: true
      });
      setLocalStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      return stream;
    } catch (error) {
      console.error('Failed to get media devices:', error);
      return null;
    }
  }, [callType]);

  const createPeerConnection = useCallback((targetUserId, stream) => {
    const pc = new RTCPeerConnection(config);
    
    // Add local tracks to connection
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Handle incoming tracks
    pc.ontrack = (event) => {
      setRemoteStreams(prev => ({
        ...prev,
        [targetUserId]: event.streams[0]
      }));
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        emit('webrtc_ice_candidate', {
          target_user_id: targetUserId,
          candidate: event.candidate,
          conversation_id: conversation?.id
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'connected') {
        setCallStatus('connected');
      }
    };

    peerConnectionsRef.current[targetUserId] = pc;
    return pc;
  }, [conversation?.id, emit]);

  const startCall = useCallback(async () => {
    const stream = await initializeMedia();
    if (!stream) return;

    const others = getOtherParticipants();
    
    for (const participant of others) {
      // Emit call request
      emit('call_user', {
        target_user_id: participant.id,
        caller_id: user?.id,
        conversation_id: conversation?.id,
        call_type: callType
      });

      // Create peer connection and offer
      const pc = createPeerConnection(participant.id, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      emit('webrtc_offer', {
        target_user_id: participant.id,
        offer: offer,
        conversation_id: conversation?.id,
        caller_id: user?.id
      });
    }
  }, [initializeMedia, getOtherParticipants, emit, user, conversation, callType, createPeerConnection]);

  const answerCall = useCallback(async () => {
    const stream = await initializeMedia();
    if (!stream) return;

    emit('accept_call', {
      caller_id: callerId,
      user_id: user?.id,
      conversation_id: conversation?.id
    });
  }, [initializeMedia, emit, callerId, user, conversation]);

  useEffect(() => {
    if (isInitiator) {
      startCall();
    } else {
      answerCall();
    }

    return () => {
      // Cleanup
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
      Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    };
  }, []);

  // Handle WebRTC events
  useEffect(() => {
    const handleOffer = async (data) => {
      if (data.conversation_id !== conversation?.id) return;
      
      const stream = localStream || await initializeMedia();
      if (!stream) return;

      const pc = createPeerConnection(data.caller_id, stream);
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      emit('webrtc_answer', {
        target_user_id: data.caller_id,
        answer: answer,
        conversation_id: conversation?.id
      });
    };

    const handleAnswer = async (data) => {
      const pc = peerConnectionsRef.current[data.target_user_id];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        setCallStatus('connected');
      }
    };

    const handleIceCandidate = async (data) => {
      const pc = peerConnectionsRef.current[data.target_user_id] || 
                 Object.values(peerConnectionsRef.current)[0];
      if (pc && data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      }
    };

    const handleCallAccepted = (data) => {
      setCallStatus('connected');
    };

    const handleCallEnded = () => {
      onEndCall();
    };

    on('webrtc_offer', handleOffer);
    on('webrtc_answer', handleAnswer);
    on('webrtc_ice_candidate', handleIceCandidate);
    on('call_accepted', handleCallAccepted);
    on('call_ended', handleCallEnded);
    on('call_rejected', handleCallEnded);

    return () => {
      off('webrtc_offer', handleOffer);
      off('webrtc_answer', handleAnswer);
      off('webrtc_ice_candidate', handleIceCandidate);
      off('call_accepted', handleCallAccepted);
      off('call_ended', handleCallEnded);
      off('call_rejected', handleCallEnded);
    };
  }, [conversation?.id, localStream, on, off, emit, createPeerConnection, initializeMedia, onEndCall]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
      // Replace with camera
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const videoTrack = stream.getVideoTracks()[0];
      
      Object.values(peerConnectionsRef.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });
      
      setIsScreenSharing(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = stream;
        const screenTrack = stream.getVideoTracks()[0];
        
        screenTrack.onended = () => {
          setIsScreenSharing(false);
        };

        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });
        
        setIsScreenSharing(true);
      } catch (error) {
        console.error('Screen share failed:', error);
      }
    }
  };

  const endCall = () => {
    const others = getOtherParticipants();
    others.forEach(participant => {
      emit('end_call', {
        target_user_id: participant.id,
        user_id: user?.id,
        conversation_id: conversation?.id
      });
    });
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    onEndCall();
  };

  const otherParticipants = getOtherParticipants();
  const remoteStreamEntries = Object.entries(remoteStreams);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-50 flex flex-col"
      data-testid="video-call"
    >
      {/* Main Video Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Remote Videos */}
        {remoteStreamEntries.length > 0 ? (
          <div className={`grid h-full ${remoteStreamEntries.length > 1 ? 'grid-cols-2' : ''} gap-2 p-4`}>
            {remoteStreamEntries.map(([oderId, stream]) => (
              <div key={oderId} className="relative rounded-2xl overflow-hidden bg-gray-900">
                <video
                  autoPlay
                  playsInline
                  ref={(el) => { if (el) el.srcObject = stream; }}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded-full text-white text-sm">
                  {otherParticipants.find(p => p.id === oderId)?.username || 'Unknown'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="relative mb-6">
                <Avatar className="w-32 h-32 mx-auto border-4 border-white/20">
                  <AvatarImage src={otherParticipants[0]?.avatar_url} />
                  <AvatarFallback className="text-4xl bg-gray-800 text-white">
                    {otherParticipants[0]?.username?.charAt(0)?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {callStatus === 'calling' && (
                  <div className="absolute inset-0 animate-ping">
                    <div className="w-32 h-32 mx-auto rounded-full border-4 border-white/30" />
                  </div>
                )}
              </div>
              <h3 className="text-white text-2xl font-semibold">
                {conversation?.is_group ? conversation.name : otherParticipants[0]?.username}
              </h3>
              <p className="text-gray-400 mt-2">
                {callStatus === 'calling' ? 'Calling...' : callStatus === 'connected' ? 'Connected' : 'Connecting...'}
              </p>
            </div>
          </div>
        )}

        {/* Local Video (PiP) */}
        <div className="absolute top-4 right-4 w-48 aspect-video rounded-xl bg-gray-900 border border-white/10 shadow-xl overflow-hidden">
          {!isVideoOff && callType === 'video' ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover mirror"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Avatar className="w-16 h-16">
                <AvatarImage src={user?.avatar_url} />
                <AvatarFallback>{user?.username?.charAt(0)?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 shadow-2xl">
        <Button
          variant="ghost"
          size="icon"
          className={`w-14 h-14 rounded-full ${isMuted ? 'bg-destructive text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
          onClick={toggleMute}
          data-testid="toggle-mute-btn"
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </Button>

        {callType === 'video' && (
          <Button
            variant="ghost"
            size="icon"
            className={`w-14 h-14 rounded-full ${isVideoOff ? 'bg-destructive text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            onClick={toggleVideo}
            data-testid="toggle-video-btn"
          >
            {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className={`w-14 h-14 rounded-full ${isScreenSharing ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
          onClick={toggleScreenShare}
          data-testid="toggle-screen-share-btn"
        >
          <Monitor className="w-6 h-6" />
        </Button>

        <Button
          size="icon"
          className="w-14 h-14 rounded-full bg-destructive text-white hover:bg-destructive/90"
          onClick={endCall}
          data-testid="end-call-btn"
        >
          <Phone className="w-6 h-6 rotate-[135deg]" />
        </Button>
      </div>

      {/* Participant count for group calls */}
      {conversation?.is_group && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full text-white">
          <Users className="w-4 h-4" />
          <span>{remoteStreamEntries.length + 1} participants</span>
        </div>
      )}
    </motion.div>
  );
};

export default VideoCall;
