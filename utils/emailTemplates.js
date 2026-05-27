/**
 * Professional Email Templates for MSI
 * Brand Colors: #6567df (primary), rgba(101, 103, 223, 0.3) (shadow/accent)
 */

// Base email styling with modern design
const getEmailWrapper = (content) => {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MSI Notification</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(101, 103, 223, 0.3);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #6567df 0%, #7e22ce 100%); padding: 40px 30px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            Manipal Society
          </h1>
          <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 14px;">MSI - Your Trusted Financial Partner</p>
        </div>

        <!-- Content -->
        <div style="padding: 40px 30px;">
          ${content}
        </div>

        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 13px; margin: 0 0 10px 0;">
            This is an automated notification from Manipal Society.
          </p>
          <p style="color: #6b7280; font-size: 13px; margin: 0 0 10px 0;">
            For any queries, please contact our support team.
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
            © 2026 Manipal Society. All rights reserved.
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
};

// Info box component
const getInfoBox = (title, items) => {
    const itemsHtml = items.map(item => `
    <p style="margin: 8px 0; color: #374151;">
      <strong style="color: #6567df;">${item.label}:</strong> ${item.value}
    </p>
  `).join('');

    return `
    <div style="background: linear-gradient(135deg, rgba(101, 103, 223, 0.05) 0%, rgba(126, 34, 206, 0.05) 100%); 
                border-left: 4px solid #6567df; 
                padding: 20px; 
                margin: 25px 0; 
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(101, 103, 223, 0.1);">
      <h3 style="color: #6567df; margin-top: 0; margin-bottom: 15px; font-size: 18px;">${title}</h3>
      ${itemsHtml}
    </div>
  `;
};

// Success alert component
const getSuccessAlert = (message) => {
    return `
    <div style="background-color: #ecfdf5; 
                border-left: 4px solid #10b981; 
                padding: 16px 20px; 
                margin: 20px 0; 
                border-radius: 8px;">
      <p style="color: #065f46; margin: 0; font-size: 15px;">
        ✓ ${message}
      </p>
    </div>
  `;
};

// Warning alert component
const getWarningAlert = (message) => {
    return `
    <div style="background-color: #fef3c7; 
                border-left: 4px solid #f59e0b; 
                padding: 16px 20px; 
                margin: 20px 0; 
                border-radius: 8px;">
      <p style="color: #92400e; margin: 0; font-size: 15px;">
        ⚠ ${message}
      </p>
    </div>
  `;
};

// Error alert component
const getErrorAlert = (message) => {
    return `
    <div style="background-color: #fee2e2; 
                border-left: 4px solid #ef4444; 
                padding: 16px 20px; 
                margin: 20px 0; 
                border-radius: 8px;">
      <p style="color: #991b1b; margin: 0; font-size: 15px;">
        ✕ ${message}
      </p>
    </div>
  `;
};

// 1. KYC Submitted Email
const generateKYCSubmittedEmail = (name, memberId) => {
    const content = `
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">
      Dear <strong style="color: #6567df;">${name}</strong>,
    </p>

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      Your KYC (Know Your Customer) details have been successfully submitted and are currently under review.
    </p>

    ${getInfoBox('Submission Details', [
        { label: 'Member ID', value: memberId },
        { label: 'Status', value: 'Under Review' },
        { label: 'Submitted On', value: new Date().toLocaleDateString('en-IN', { dateStyle: 'full' }) }
    ])}

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      Our team will verify your documents and bank details. You will receive a confirmation email once your KYC is approved.
    </p>

    ${getWarningAlert('This process may take 24-48 hours. You will be notified once the verification is complete.')}

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Best regards,<br/>
      <strong style="color: #6567df;">Manipal Society Team</strong>
    </p>
  `;

    return {
        subject: 'MSI - KYC Submitted Successfully',
        html: getEmailWrapper(content),
        text: `Dear ${name}, Your KYC details have been successfully submitted for Member ID: ${memberId}. Our team will verify your documents and you will receive a confirmation email once approved.`
    };
};

// 2. KYC Approved Email
const generateKYCApprovedEmail = (name, memberId) => {
    const content = `
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">
      Dear <strong style="color: #6567df;">${name}</strong>,
    </p>

    ${getSuccessAlert('Your KYC verification has been completed successfully!')}

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      Congratulations! Your KYC (Know Your Customer) verification has been approved. Your account is now fully activated and you can access all features.
    </p>

    ${getInfoBox('Verification Details', [
        { label: 'Member ID', value: memberId },
        { label: 'Status', value: '<span style="color: #10b981;">✓ Approved</span>' },
        { label: 'Verified On', value: new Date().toLocaleDateString('en-IN', { dateStyle: 'full' }) }
    ])}

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      You can now:
    </p>

    <ul style="color: #374151; font-size: 15px; line-height: 1.8; padding-left: 20px;">
      <li>Create savings and investment accounts</li>
      <li>Make deposits and withdrawals</li>
      <li>Access all banking services</li>
      <li>View your transaction history</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
      <p style="background: linear-gradient(135deg, #6567df 0%, #7e22ce 100%); 
                 color: white; 
                 padding: 14px 32px; 
                 border-radius: 8px; 
                 display: inline-block;
                 text-decoration: none;
                 font-weight: 600;
                 box-shadow: 0 4px 12px rgba(101, 103, 223, 0.3);">
        🎉 Your Account is Ready
      </p>
    </div>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Best regards,<br/>
      <strong style="color: #6567df;">Manipal Society Team</strong>
    </p>
  `;

    return {
        subject: 'MSI - KYC Approved! Account Activated',
        html: getEmailWrapper(content),
        text: `Dear ${name}, Congratulations! Your KYC verification has been approved for Member ID: ${memberId}. Your account is now fully activated and you can access all features.`
    };
};

// 3. KYC Failed Email
const generateKYCFailedEmail = (name, memberId, reason) => {
    const content = `
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">
      Dear <strong style="color: #6567df;">${name}</strong>,
    </p>

    ${getErrorAlert('Your KYC verification could not be completed at this time.')}

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      We were unable to verify your KYC details due to the following reason:
    </p>

    ${getInfoBox('Verification Details', [
        { label: 'Member ID', value: memberId },
        { label: 'Status', value: '<span style="color: #ef4444;">✕ Failed</span>' },
        { label: 'Reason', value: reason || 'Bank verification failed' },
        { label: 'Date', value: new Date().toLocaleDateString('en-IN', { dateStyle: 'full' }) }
    ])}

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      <strong>What to do next:</strong>
    </p>

    <ul style="color: #374151; font-size: 15px; line-height: 1.8; padding-left: 20px;">
      <li>Review your bank account details carefully</li>
      <li>Ensure the name on your bank account matches your registered name</li>
      <li>Verify your IFSC code and account number</li>
      <li>Submit your KYC details again with correct information</li>
    </ul>

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      If you need assistance, please contact our support team.
    </p>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Best regards,<br/>
      <strong style="color: #6567df;">Manipal Society Team</strong>
    </p>
  `;

    return {
        subject: 'MSI - KYC Verification Failed',
        html: getEmailWrapper(content),
        text: `Dear ${name}, Your KYC verification for Member ID: ${memberId} could not be completed. Reason: ${reason || 'Bank verification failed'}. Please review your details and submit again.`
    };
};

// 4. Password Updated Email
const generatePasswordUpdatedEmail = (name, memberId) => {
    const content = `
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">
      Dear <strong style="color: #6567df;">${name}</strong>,
    </p>

    ${getWarningAlert('Your account password has been changed.')}

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      This is a security notification to inform you that your account password was recently updated.
    </p>

    ${getInfoBox('Security Details', [
        { label: 'Member ID', value: memberId },
        { label: 'Action', value: 'Password Updated' },
        { label: 'Date & Time', value: new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' }) }
    ])}

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      <strong>Did you make this change?</strong>
    </p>

    <ul style="color: #374151; font-size: 15px; line-height: 1.8; padding-left: 20px;">
      <li><strong>Yes:</strong> No action needed. Your account is secure.</li>
      <li><strong>No:</strong> Please contact our support team immediately to secure your account.</li>
    </ul>

    <div style="background-color: #fef3c7; 
                border: 2px solid #f59e0b; 
                padding: 20px; 
                margin: 25px 0; 
                border-radius: 8px;">
      <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 600;">
        🔒 Security Tip: Never share your password with anyone. MSI will never ask for your password via email or phone.
      </p>
    </div>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Best regards,<br/>
      <strong style="color: #6567df;">Manipal Society Team</strong>
    </p>
  `;

    return {
        subject: 'MSI - Password Updated Successfully',
        html: getEmailWrapper(content),
        text: `Dear ${name}, Your account password for Member ID: ${memberId} has been updated on ${new Date().toLocaleString('en-IN')}. If you did not make this change, please contact support immediately.`
    };
};

// 5. Bank Account Created Email
const generateAccountCreatedEmail = (name, memberId, accountType, accountNo, interestRate, maturityDate) => {
    const accountDetails = [
        { label: 'Account Type', value: accountType },
        { label: 'Account Number', value: accountNo },
        { label: 'Member ID', value: memberId }
    ];

    if (interestRate && interestRate > 0) {
        accountDetails.push({ label: 'Interest Rate', value: `${interestRate}% per annum` });
    }

    if (maturityDate) {
        accountDetails.push({
            label: 'Maturity Date',
            value: new Date(maturityDate).toLocaleDateString('en-IN', { dateStyle: 'long' })
        });
    }

    accountDetails.push({
        label: 'Opened On',
        value: new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })
    });

    const content = `
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">
      Dear <strong style="color: #6567df;">${name}</strong>,
    </p>

    ${getSuccessAlert('Your new account has been created successfully!')}

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      Congratulations! Your <strong>${accountType}</strong> account has been successfully opened with Manipal Society.
    </p>

    ${getInfoBox('Account Details', accountDetails)}

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      You can now start using this account for deposits and transactions. Please keep your account number safe for future reference.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <p style="background: linear-gradient(135deg, #6567df 0%, #7e22ce 100%); 
                 color: white; 
                 padding: 14px 32px; 
                 border-radius: 8px; 
                 display: inline-block;
                 font-weight: 600;
                 box-shadow: 0 4px 12px rgba(101, 103, 223, 0.3);">
        🎉 Account Number: ${accountNo}
      </p>
    </div>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Best regards,<br/>
      <strong style="color: #6567df;">Manipal Society Team</strong>
    </p>
  `;

    return {
        subject: `MSI - ${accountType} Account Created Successfully`,
        html: getEmailWrapper(content),
        text: `Dear ${name}, Your ${accountType} account (${accountNo}) has been successfully created. Member ID: ${memberId}. ${interestRate ? `Interest Rate: ${interestRate}%` : ''}`
    };
};

// 6. Transaction Completed Email
const generateTransactionEmail = (name, memberId, transactionId, accountNo, accountType, type, amount, balance, description) => {
    const isCredit = type.toLowerCase() === 'credit';

    const content = `
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">
      Dear <strong style="color: #6567df;">${name}</strong>,
    </p>

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      A transaction has been processed on your account.
    </p>

    ${getInfoBox('Transaction Details', [
        { label: 'Transaction ID', value: transactionId },
        { label: 'Account Number', value: accountNo },
        { label: 'Account Type', value: accountType },
        { label: 'Transaction Type', value: `<span style="color: ${isCredit ? '#10b981' : '#ef4444'};">${isCredit ? '↓ Credit' : '↑ Debit'}</span>` },
        { label: 'Amount', value: `$${parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        { label: 'New Balance', value: `$${parseFloat(balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        { label: 'Description', value: description || 'N/A' },
        { label: 'Date & Time', value: new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' }) }
    ])}

    ${isCredit ?
            getSuccessAlert(`Amount of $${parseFloat(amount).toLocaleString('en-IN')} has been credited to your account.`) :
            getWarningAlert(`Amount of $${parseFloat(amount).toLocaleString('en-IN')} has been debited from your account.`)
        }

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      If you did not authorize this transaction, please contact our support team immediately.
    </p>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Best regards,<br/>
      <strong style="color: #6567df;">Manipal Society Team</strong>
    </p>
  `;

    return {
        subject: `MSI - Transaction ${isCredit ? 'Credit' : 'Debit'} Alert`,
        html: getEmailWrapper(content),
        text: `Dear ${name}, Transaction ${transactionId}: $${amount} ${isCredit ? 'credited to' : 'debited from'} your account ${accountNo}. New balance: $${balance}.`
    };
};

// 7. Withdrawal Processed Email
const generateWithdrawalEmail = (name, memberId, transactionId, accountNo, amount, status) => {
    const isSuccess = status.toLowerCase() === 'success' || status.toLowerCase() === 'completed';

    const content = `
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">
      Dear <strong style="color: #6567df;">${name}</strong>,
    </p>

    ${isSuccess ?
            getSuccessAlert('Your withdrawal request has been processed successfully!') :
            getWarningAlert('Your withdrawal request is being processed.')
        }

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      ${isSuccess ?
            'The requested amount has been transferred to your registered bank account.' :
            'Your withdrawal request has been received and is currently being processed.'
        }
    </p>

    ${getInfoBox('Withdrawal Details', [
            { label: 'Transaction ID', value: transactionId },
            { label: 'Member ID', value: memberId },
            { label: 'Account Number', value: accountNo },
            { label: 'Amount', value: `$${parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            { label: 'Status', value: isSuccess ? '<span style="color: #10b981;">✓ Completed</span>' : '<span style="color: #f59e0b;">⏳ Processing</span>' },
            { label: 'Date & Time', value: new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' }) }
        ])}

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      ${isSuccess ?
            'The amount should reflect in your bank account within 1-2 business days depending on your bank.' :
            'You will receive another notification once the withdrawal is completed.'
        }
    </p>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Best regards,<br/>
      <strong style="color: #6567df;">Manipal Society Team</strong>
    </p>
  `;

    return {
        subject: `MSI - Withdrawal ${isSuccess ? 'Completed' : 'Processing'}`,
        html: getEmailWrapper(content),
        text: `Dear ${name}, Your withdrawal request of $${amount} for account ${accountNo} is ${isSuccess ? 'completed' : 'being processed'}. Transaction ID: ${transactionId}.`
    };
};

// 8. Welcome Email (Member/Agent Registration)
const generateWelcomeEmail = (name, userId, password, role = 'Member') => {
    const content = `
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">
      Dear <strong style="color: #6567df;">${name}</strong>,
    </p>

    ${getSuccessAlert(`Welcome to Manipal Society! Your ${role.toLowerCase()} account has been created.`)}

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      Your account has been successfully registered with Manipal Society. Below are your login credentials:
    </p>

    ${getInfoBox('Login Credentials', [
        { label: `${role} ID`, value: `<strong style="color: #6567df; font-size: 18px;">${userId}</strong>` },
        { label: 'Password', value: `<strong style="color: #6567df; font-size: 18px;">${password}</strong>` },
        { label: 'Registration Date', value: new Date().toLocaleDateString('en-IN', { dateStyle: 'full' }) }
    ])}

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      <strong>Getting Started:</strong>
    </p>

    <ul style="color: #374151; font-size: 15px; line-height: 1.8; padding-left: 20px;">
      <li>Login using your ${role} ID and password</li>
      <li>Complete your KYC verification to activate all features</li>
      <li>Change your password after first login for security</li>
      <li>Explore our banking services and investment options</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
      <p style="background: linear-gradient(135deg, #6567df 0%, #7e22ce 100%); 
                 color: white; 
                 padding: 14px 32px; 
                 border-radius: 8px; 
                 display: inline-block;
                 font-weight: 600;
                 box-shadow: 0 4px 12px rgba(101, 103, 223, 0.3);">
        🎉 Welcome to MSI Family!
      </p>
    </div>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Best regards,<br/>
      <strong style="color: #6567df;">Manipal Society Team</strong>
    </p>
  `;

    return {
        subject: `MSI - Welcome! Your ${role} Account is Ready`,
        html: getEmailWrapper(content),
        text: `Dear ${name}, Welcome to Manipal Society! Your ${role} account has been created. ${role} ID: ${userId}, Password: ${password}. Please login and change your password immediately.`
    };
};

module.exports = {
    generateKYCSubmittedEmail,
    generateKYCApprovedEmail,
    generateKYCFailedEmail,
    generatePasswordUpdatedEmail,
    generateAccountCreatedEmail,
    generateTransactionEmail,
    generateWithdrawalEmail,
    generateWelcomeEmail
};
