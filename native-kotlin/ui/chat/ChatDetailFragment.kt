package com.merilive.app.ui.chat

import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.data.model.ChatMessage
import com.merilive.app.databinding.FragmentChatDetailBinding
import com.merilive.app.ui.chat.adapter.MessageAdapter
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.storage.Storage
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import javax.inject.Inject

@AndroidEntryPoint
class ChatDetailFragment : Fragment() {

    private var _binding: FragmentChatDetailBinding? = null
    private val binding get() = _binding!!
    private val viewModel: ChatDetailViewModel by viewModels()

    private lateinit var adapter: MessageAdapter
    private var conversationId: String = ""
    private var otherUserId: String = ""

    private val pickMedia = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { viewModel.sendMedia(requireContext(), conversationId, it) }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentChatDetailBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        conversationId = arguments?.getString("conversationId") ?: ""
        otherUserId = arguments?.getString("otherUserId") ?: ""
        val otherUserName = arguments?.getString("otherUserName") ?: "Chat"

        binding.tvTitle.text = otherUserName
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        // Message list
        val layoutManager = LinearLayoutManager(requireContext())
        layoutManager.stackFromEnd = true
        binding.rvMessages.layoutManager = layoutManager
        adapter = MessageAdapter(viewModel.currentUserId)
        binding.rvMessages.adapter = adapter

        // Send text
        binding.btnSend.setOnClickListener { sendMessage() }
        binding.etMessage.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                sendMessage()
                true
            } else false
        }

        // Typing indicator
        binding.etMessage.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                viewModel.sendTypingIndicator(conversationId)
            }
        })

        // Send media
        binding.btnAttach.setOnClickListener { pickMedia.launch("image/*") }

        // Send gift (in-chat)
        binding.btnGift.setOnClickListener {
            viewModel.sendGiftMessage(conversationId, "gift_rose", "🌹 Rose")
        }

        // Load messages or create conversation
        if (conversationId.isEmpty() && otherUserId.isNotEmpty()) {
            viewModel.getOrCreateConversation(otherUserId) { newConvId ->
                conversationId = newConvId
                viewModel.loadMessages(conversationId)
            }
        } else {
            viewModel.loadMessages(conversationId)
        }
        observeState()
    }

    private fun sendMessage() {
        val text = binding.etMessage.text.toString().trim()
        if (text.isEmpty()) return
        viewModel.sendTextMessage(conversationId, text)
        binding.etMessage.setText("")
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.messages.collect { messages ->
                adapter.submitList(messages)
                if (messages.isNotEmpty()) {
                    binding.rvMessages.scrollToPosition(messages.size - 1)
                }
            }
        }

        // Typing indicator
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.otherTyping.collect { isTyping ->
                binding.tvTitle.text = if (isTyping) {
                    "${arguments?.getString("otherUserName") ?: "Chat"} • typing..."
                } else {
                    arguments?.getString("otherUserName") ?: "Chat"
                }
            }
        }

        // Online status
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.otherOnline.collect { isOnline ->
                // Could show green dot on toolbar avatar
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        viewModel.cleanupRealtimeChannels()
        _binding = null
    }
}

@HiltViewModel
class ChatDetailViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val storage: Storage,
    private val realtime: Realtime,
) : ViewModel() {

    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages = _messages.asStateFlow()

    private val _otherTyping = MutableStateFlow(false)
    val otherTyping = _otherTyping.asStateFlow()

    private val _otherOnline = MutableStateFlow(false)
    val otherOnline = _otherOnline.asStateFlow()

    val currentUserId: String
        get() = auth.currentSessionOrNull()?.user?.id ?: ""

    private var typingJob: Job? = null
    private var realtimeChannel: io.github.jan.supabase.realtime.RealtimeChannel? = null

    private fun nowIso(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    fun getOrCreateConversation(otherUserId: String, onCreated: (String) -> Unit) {
        viewModelScope.launch {
            try {
                // Try find existing — DB uses participant_1 / participant_2
                val existing = postgrest.from("conversations")
                    .select {
                        filter {
                            or {
                                and {
                                    eq("participant_1", currentUserId)
                                    eq("participant_2", otherUserId)
                                }
                                and {
                                    eq("participant_1", otherUserId)
                                    eq("participant_2", currentUserId)
                                }
                            }
                        }
                        limit(1)
                    }
                    .decodeList<ConversationIdResponse>()

                if (existing.isNotEmpty()) {
                    onCreated(existing.first().id)
                } else {
                    // Create new
                    val newConv = postgrest.from("conversations")
                        .insert(mapOf(
                            "participant_1" to currentUserId,
                            "participant_2" to otherUserId,
                        )) {
                            select()
                        }
                        .decodeSingle<ConversationIdResponse>()
                    onCreated(newConv.id)
                }
            } catch (e: Exception) {
                // Handle error
            }
        }
    }

    fun loadMessages(conversationId: String) {
        viewModelScope.launch {
            try {
                val result = postgrest.from("messages")
                    .select {
                        filter { eq("conversation_id", conversationId) }
                        order("created_at", Order.ASCENDING)
                        limit(200)
                    }
                    .decodeList<ChatDetailMessageResponse>()

                _messages.value = result.map { it.toChatMessage(conversationId) }

                markAsRead(conversationId)
                subscribeToMessages(conversationId)
                subscribeToPresence(conversationId)
            } catch (e: Exception) {
                // Handle error
            }
        }
    }

    fun sendTextMessage(conversationId: String, text: String) {
        val optimisticId = UUID.randomUUID().toString()
        // Optimistic UI: add immediately with status "sending"
        val optimistic = ChatMessage(
            id = optimisticId,
            conversation_id = conversationId,
            sender_id = currentUserId,
            content = text,
            message_type = "text",
            is_read = false,
            created_at = nowIso(),
            status = "sending",
        )
        _messages.value = _messages.value + optimistic

        viewModelScope.launch {
            try {
                postgrest.from("messages").insert(mapOf(
                    "conversation_id" to conversationId,
                    "sender_id" to currentUserId,
                    "content" to text,
                    "message_type" to "text",
                ))

                // conversations has no last_message column — only last_message_at
                postgrest.from("conversations").update(mapOf(
                    "last_message_at" to nowIso(),
                )) {
                    filter { eq("id", conversationId) }
                }

                // Update optimistic to sent
                _messages.value = _messages.value.map {
                    if (it.id == optimisticId) it.copy(status = "sent") else it
                }
            } catch (e: Exception) {
                // Mark as failed
                _messages.value = _messages.value.map {
                    if (it.id == optimisticId) it.copy(status = "failed") else it
                }
            }
        }
    }

    fun sendGiftMessage(conversationId: String, giftId: String, giftName: String) {
        viewModelScope.launch {
            try {
                postgrest.from("messages").insert(mapOf(
                    "conversation_id" to conversationId,
                    "sender_id" to currentUserId,
                    "content" to "🎁 Sent a $giftName",
                    "message_type" to "gift",
                ))

                postgrest.from("conversations").update(mapOf(
                    "last_message_at" to nowIso(),
                )) {
                    filter { eq("id", conversationId) }
                }
            } catch (e: Exception) { /* Handle */ }
        }
    }

    fun sendMedia(context: android.content.Context, conversationId: String, uri: Uri) {
        viewModelScope.launch {
            try {
                val inputStream = context.contentResolver.openInputStream(uri) ?: return@launch
                val bytes = inputStream.readBytes()
                inputStream.close()

                val fileName = "chat/$conversationId/${System.currentTimeMillis()}.jpg"
                val bucket = storage.from("chat-media")
                bucket.upload(fileName, bytes, upsert = true)
                val publicUrl = bucket.publicUrl(fileName)

                // messages table has no media_url column — store URL in content
                postgrest.from("messages").insert(mapOf(
                    "conversation_id" to conversationId,
                    "sender_id" to currentUserId,
                    "content" to publicUrl,
                    "message_type" to "image",
                ))

                postgrest.from("conversations").update(mapOf(
                    "last_message_at" to nowIso(),
                )) {
                    filter { eq("id", conversationId) }
                }
            } catch (e: Exception) { /* Handle */ }
        }
    }

    fun sendTypingIndicator(conversationId: String) {
        typingJob?.cancel()
        typingJob = viewModelScope.launch {
            try {
                realtimeChannel?.broadcast("typing", mapOf("user_id" to currentUserId))
            } catch (_: Exception) {}
        }
    }

    private fun markAsRead(conversationId: String) {
        viewModelScope.launch {
            try {
                postgrest.from("messages")
                    .update(mapOf("is_read" to true, "read_at" to nowIso())) {
                        filter {
                            eq("conversation_id", conversationId)
                            neq("sender_id", currentUserId)
                            eq("is_read", false)
                        }
                    }
            } catch (_: Exception) {}
        }
    }

    private fun subscribeToMessages(conversationId: String) {
        viewModelScope.launch {
            try {
                val channel = realtime.channel("chat-$conversationId")
                realtimeChannel = channel
                val flow = channel.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
                    table = "messages"
                    filter = "conversation_id=eq.$conversationId"
                }
                channel.subscribe()

                flow.collect { change ->
                    val result = postgrest.from("messages")
                        .select {
                            filter { eq("conversation_id", conversationId) }
                            order("created_at", Order.ASCENDING)
                            limit(200)
                        }
                        .decodeList<ChatDetailMessageResponse>()
                    _messages.value = result.map { it.toChatMessage(conversationId) }
                    markAsRead(conversationId)
                }
            } catch (_: Exception) {}
        }
    }

    private fun subscribeToPresence(conversationId: String) {
        viewModelScope.launch {
            try {
                val channel = realtimeChannel ?: return@launch
                channel.broadcast("typing").collect { event ->
                    val typingUserId = (event as? Map<*, *>)?.get("user_id") as? String
                    if (typingUserId != null && typingUserId != currentUserId) {
                        _otherTyping.value = true
                        delay(3000)
                        _otherTyping.value = false
                    }
                }
            } catch (_: Exception) {}
        }
    }

    fun cleanupRealtimeChannels() {
        viewModelScope.launch {
            try {
                realtimeChannel?.unsubscribe()
            } catch (_: Exception) {}
        }
    }
}

@Serializable
data class ConversationIdResponse(val id: String)

@Serializable
data class ChatDetailMessageResponse(
    val id: String,
    val sender_id: String,
    val content: String? = null,
    val message_type: String? = null,
    val is_read: Boolean? = null,
    val status: String? = null,
    val read_at: String? = null,
    val delivered_at: String? = null,
    val created_at: String? = null,
) {
    fun toChatMessage(convId: String) = ChatMessage(
        id = id,
        conversation_id = convId,
        sender_id = sender_id,
        content = content,
        message_type = message_type ?: "text",
        is_read = is_read ?: false,
        status = when {
            is_read == true -> "read"
            delivered_at != null -> "delivered"
            else -> status ?: "sent"
        },
        read_at = read_at,
        delivered_at = delivered_at,
        created_at = created_at,
    )
}
