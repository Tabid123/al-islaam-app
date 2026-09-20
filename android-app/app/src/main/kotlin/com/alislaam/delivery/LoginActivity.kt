package com.alislaam.delivery

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.alislaam.delivery.auth.AuthRepository
import com.alislaam.delivery.ui.theme.AlIslaamDataTheme
import kotlinx.coroutines.launch

class LoginActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AlIslaamDataTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFFF5F5F5)
                ) {
                    LoginScreen(onLoggedIn = {
                        startActivity(Intent(this, MainActivity::class.java))
                        finish()
                    })
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LoginScreen(onLoggedIn: () -> Unit) {
    val ctx = LocalContext.current
    val auth = remember { AuthRepository(ctx.applicationContext) }
    val scope = rememberCoroutineScope()

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showPassword by remember { mutableStateOf(false) }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Color.Black,
        unfocusedTextColor = Color.Black,
        disabledTextColor = Color.Black,
        cursorColor = Color(0xFF3D0066),
        focusedBorderColor = Color(0xFF3D0066),
        unfocusedBorderColor = Color(0xFFBDBDBD),
        focusedLabelColor = Color(0xFF3D0066),
        unfocusedLabelColor = Color.Gray,
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF5F5F5))
            .statusBarsPadding()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = Color(0xFF3D0066),
            modifier = Modifier.padding(bottom = 16.dp)
        ) {
            Text(
                text = "RIYOKAAB DATA",
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp)
            )
        }

        Text(
            text = "Gal Admin Account",
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF333333)
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "Isticmaal isla email-ka admin-ka web-ka",
            fontSize = 12.sp,
            color = Color.Gray
        )

        Spacer(Modifier.height(24.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it.trim(); error = null },
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
            enabled = !loading,
            colors = fieldColors
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it; error = null },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
            enabled = !loading,
            colors = fieldColors,
            trailingIcon = {
                IconButton(onClick = { showPassword = !showPassword }) {
                    Icon(
                        imageVector = if (showPassword) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                        contentDescription = if (showPassword) "Qari password-ka" else "Muuji password-ka",
                        tint = Color(0xFF3D0066)
                    )
                }
            }
        )

        if (error != null) {
            Spacer(Modifier.height(12.dp))
            Text(
                text = error ?: "",
                color = Color(0xFFD32F2F),
                fontSize = 13.sp
            )
        }

        Spacer(Modifier.height(20.dp))

        Button(
            onClick = {
                if (email.isBlank() || password.isBlank()) {
                    error = "Geli email iyo password"
                    return@Button
                }
                loading = true
                error = null
                scope.launch {
                    val res = auth.login(email, password)
                    loading = false
                    if (res.success) {
                        onLoggedIn()
                    } else {
                        error = res.errorMessage ?: "Login failed"
                    }
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3D0066)),
            enabled = !loading
        ) {
            if (loading) {
                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(20.dp)
                )
            } else {
                Text("Gal", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}
